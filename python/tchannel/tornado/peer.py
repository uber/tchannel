# Copyright (c) 2015 Uber Technologies, Inc.
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in
# all copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
# THE SOFTWARE.

from __future__ import absolute_import

import logging
from collections import deque
from itertools import chain
from random import random

from tornado import gen

from ..handler import CallableRequestHandler
from ..zipkin.annotation import Endpoint
from ..zipkin.trace import Trace
from .connection import StreamConnection
from .data import Request
from .stream import InMemStream
from .stream import Stream
from .stream import read_full

try:
    # included in Tornado 4.2
    from tornado.locks import Condition
except ImportError:  # pragma: no cover
    from toro import Condition


log = logging.getLogger('tchannel')


class PeerGroup(object):
    """A PeerGroup represents a collection of Peers.

    Requests routed through a PeerGroup can be sent to either a specific peer
    or a peer chosen at random.
    """

    def __init__(self, tchannel, score_threshold=None):
        """Initializes a new PeerGroup.

        :param tchannel:
            TChannel used for communication by this PeerGroup
        :param score_threshold:
            A value in the ``[0, 1]`` range. If specifiede, this requires that
            chosen peers havea score higher than this value when performing
            requests.
        """
        self.tchannel = tchannel

        self._score_threshold = score_threshold

        # Dictionary from hostport to Peer.
        self._peers = {}

        # Notified when a reset is performed. This allows multiple coroutines
        # to block on the same reset.
        self._resetting = False
        self._reset_condition = Condition()

    def __str__(self):
        return "<PeerGroup peers=%s>" % str(self._peers)

    @gen.coroutine
    def clear(self):
        """Reset this PeerGroup.

        This closes all connections to all known peers and forgets about
        these peers.

        :returns:
            A Future that resolves with a value of None when the operation
            has finished
        """
        if self._resetting:
            # If someone else is already resetting the PeerGroup, just block
            # on them to be finished.
            yield self._reset_condition.wait()
            raise gen.Return(None)

        self._resetting = True
        try:
            yield [peer.close() for peer in self._peers.values()]
        finally:
            self._peers = {}
            self._resetting = False
            self._reset_condition.notify_all()

    def get(self, hostport):
        """Get a Peer for the given destination.

        A new Peer is added and returned if one does not already exist for the
        given host-port. Otherwise, the existing Peer is returned.
        """
        assert hostport, "hostport is required"
        if hostport not in self._peers:
            self._peers[hostport] = Peer(self.tchannel, hostport)
        return self._peers[hostport]

    def lookup(self, hostport):
        """Look up a Peer for the given host and port.

        Returns None if a Peer for the given host-port does not exist.
        """
        assert hostport, "hostport is required"
        return self._peers.get(hostport, None)

    def remove(self, hostport):
        """Delete the Peer for the given host port.

        Does nothing if a matching Peer does not exist.

        :returns: The removed Peer
        """
        assert hostport, "hostport is required"
        return self._peers.pop(hostport, None)

    def add(self, peer):
        """Add an existing Peer to this group.

        A peer for the given host-port must not already exist in the group.
        """
        assert peer, "peer is required"
        assert peer.hostport not in self._peers, (
            "%s already has a peer" % peer.hostport
        )

        self._peers[peer.hostport] = peer

    @property
    def hosts(self):
        """Get all host-ports managed by this PeerGroup."""
        return self._peers.keys()

    @property
    def peers(self):
        """Get all Peers managed by this PeerGroup."""
        return self._peers.values()

    def request(self, **kwargs):
        """Initiate a new request through this PeerGroup.

        :param hostport:
            If specified, requests will be sent to the specific host.
            Otherwise, a known peer will be picked at random.
        :param service:
            Name of the service being called. Defaults to an empty string.
        :param service_threshold:
            If ``hostport`` was not specified, this specifies the score
            threshold at or below which peers will be ignored.
        """
        return self.choose(
            hostport=kwargs.pop('hostport', None),
            score_threshold=kwargs.pop('score_threshold', None),
        ).request(**kwargs)

    def choose(self, hostport=None, score_threshold=None):
        """Choose a Peer that matches the given criteria.

        The Peer with the highest score will be chosen.

        :param hostport:
            Specifies that the returned Peer must be for the given host-port.
            Without this, all peers managed by this PeerGroup are
            candidates. If this is present, ``score_threshold`` is ignored.
        :param score_threshold:
            If specified, Peers with a score equal to or below this will be
            ignored. Defaults to the value specified when the PeerGroup was
            initialized.
        :returns:
            A Peer that matches all the requested criteria or None if no such
            Peer was found.
        """
        if hostport:
            return self.get(hostport)

        score_threshold = score_threshold or self._score_threshold or 0
        chosen_peer = None
        chosen_score = 0

        for host in self.hosts:
            peer = self.get(host)
            score = peer.state.score()

            if score <= score_threshold:
                continue

            if score > chosen_score:
                chosen_peer = peer
                chosen_score = score

        return chosen_peer


class Peer(object):
    """A Peer manages connections to or from a specific host-port."""

    __slots__ = (
        'tchannel',
        'state',
        'host',
        'port',

        '_out_conns',
        '_in_conns',
        '_connecting',
    )

    # Class used to create new outgoing connections.
    #
    # It must support a .outgoing method.
    connection_class = StreamConnection

    def __init__(self, tchannel, hostport, state=None):
        """Initialize a Peer

        :param tchannel:
            TChannel through which requests will be made
        :param hostport:
            Host-port this Peer is for.
        :param state:
            State of the Peer. If given, this must be an instance of PeerState.
        """
        state = state or PeerHealthyState(self)

        assert hostport, "hostport is required"
        assert isinstance(state, PeerState), "state must be a PeerState"

        self.tchannel = tchannel
        self.state = state

        self.host, port = hostport.rsplit(':', 1)
        self.port = int(port)

        self._out_conns = deque()
        self._in_conns = deque()

        # This contains a future to the TornadoConnection if we're already in
        # the process of making an outgoing connection to the peer. This
        # helps avoid making multiple outgoing connections.
        self._connecting = None

    def connect(self):
        """Get a connection to this peer.

        If an connection to the peer already exists (either incoming or
        outgoing), that's returned. Otherwise, a new outgoing connection to
        this peer is created.

        :return:
            A future containing a connection to this host.
        """
        # Prefer recently created outgoing connections over everything else.
        conns = (
            conn for conn in chain(self._out_conns, self._in_conns)
            if not conn.closed
        )
        try:
            conn = next(conns)
        except StopIteration:
            pass
        else:
            # Wrap the connection in a Future
            return gen.maybe_future(conn)

        if self._connecting:
            # If we're in the process of connecting to the peer, just wait
            # and re-use that connection.
            return self._connecting

        conn_future = self._connecting = self.connection_class.outgoing(
            hostport=self.hostport,
            process_name=self.tchannel.process_name,
            serve_hostport=self.tchannel.hostport,
            handler=CallableRequestHandler(self.tchannel.receive_call),
            tchannel=self.tchannel,
        )

        def on_connect(_):
            if not conn_future.exception():
                # We don't actually need to handle the exception. That's on
                # the caller.

                connection = conn_future.result()
                self._out_conns.appendleft(connection)
            self._connecting = None

        conn_future.add_done_callback(on_connect)
        return conn_future

    def register_incoming(self, conn):
        assert conn, "conn is required"
        self._in_conns.append(conn)

        # TODO on-close cleanup

    def request(self, *args, **kwargs):
        """Begin a request to this peer."""

        return PeerClientOperation(self, *args, **kwargs)

    @property
    def hostport(self):
        """The host-port this Peer is for."""
        return "%s:%d" % (self.host, self.port)

    @property
    def connections(self):
        """Returns a list of all connections for this peer.

        Incoming connections are listed first."""
        return list(chain(self._in_conns, self._out_conns))

    @property
    def outgoing_connections(self):
        """Returns a list of all outgoing connections for this peer."""
        return list(self._out_conns)

    @property
    def incoming_connections(self):
        """Returns a list of all incoming connections for this peer."""
        return list(self._in_conns)

    @property
    def is_ephemeral(self):
        """Whether this Peer is ephemeral."""
        return self.host == '0.0.0.0' and self.port == 0

    @property
    def connected(self):
        """Return True if this Peer is connected."""
        for conn in self.connections:
            if not conn.closed:
                return True
        return False

    @gen.coroutine
    def close(self):
        # TODO: Debounce like PeerGroup?
        yield [connection.close() for connection in self.connections]


class PeerState(object):
    """Represents the state of the Peer."""

    __slots__ = ()

    def score(self):
        """Calculate the score of the Peer in this state."""
        return 0


class PeerHealthyState(PeerState):
    """Indicates that the Peer is in a healthy state.

    The score of healthy peers is a random value between 0.2 and 1.0. This
    allows random selection between multiple matches.
    """

    __slots__ = ('peer',)

    def __init__(self, peer):
        self.peer = peer

    def score(self):
        # Connected peers have a score in the range [0.2, 1.0) and all other
        # peers have a score in the range [0.0, 0.2). So, we will always
        # prefer peers that are already connected over peers that require new
        #  connections.
        if self.peer.connected:
            return 0.2 + random() * 0.8
            # TODO this can be split between incoming and outgoing connections.
            # We probably want to prefer outgoing connections over incoming
            # connections.
        else:
            return 0.1 + random() * 0.1

        # TODO: It may be reasonable to allow the Peer or TChannel to control
        # randomness.


class PeerClientOperation(object):
    """Encapsulates client operations that can be performed against a peer."""

    def __init__(self, peer, service, **kwargs):
        """Initialize a new PeerClientOperation.

        :param peer:
            Peer to which requests will be made
        :param service:
            Name of the service being called through this peer. Defaults to
            an empty string.
        """
        assert peer, "peer must not be None"
        service = service or ''

        self.peer = peer
        self.service = service
        self.parent_tracing = kwargs.get('parent_tracing', None)
        # service name is not stored in peer because the same peer may be
        # used to call multiple services if it's being used for request
        # forwarding

    @gen.coroutine
    def send(self, arg1, arg2, arg3, traceflag=False, headers=None):
        """Make a request to the Peer.

        :param arg1:
            String or Stream containing the contents of arg1. If None, an empty
            stream is used.
        :param arg2:
            String or Stream containing the contents of arg2. If None, an empty
            stream is used.
        :param arg3:
            String or Stream containing the contents of arg3. If None, an empty
            stream is used.
        :param traceflag:
            Flag is for tracing.
        :param headers:
            Headers will be put int he message as protocol header.
        :return:
            Future that contains the response from the peer. If None, an empty
            stream is used.
        """
        arg1, arg2, arg3 = (
            maybe_stream(arg1), maybe_stream(arg2), maybe_stream(arg3)
        )

        # hack to get endpoint from arg_1 for trace name
        arg1.close()
        endpoint = yield read_full(arg1)

        if self.parent_tracing:
            parent_span_id = self.parent_tracing.span_id
            trace_id = self.parent_tracing.trace_id
        else:
            parent_span_id = None
            trace_id = None

        connection = yield self.peer.connect()
        message_id = connection.next_message_id()
        response = yield connection.send_request(
            Request(
                service=self.service,
                argstreams=[InMemStream(endpoint), arg2, arg3],
                id=message_id,
                headers=headers,
                tracing=Trace(
                    name=endpoint,
                    trace_id=trace_id,
                    parent_span_id=parent_span_id,
                    endpoint=Endpoint(self.peer.host,
                                      self.peer.port,
                                      self.service),
                    traceflags=traceflag,
                )
            )
        )

        log.debug("Got response %s", response)
        raise gen.Return(response)


def maybe_stream(s):
    """Ensure that the given argument is a stream."""
    if isinstance(s, Stream):
        return s

    if s is None:
        stream = InMemStream()
        stream.close()  # we don't intend to write anything
        return stream

    if isinstance(s, unicode):
        s = s.encode('utf-8')
    if isinstance(s, bytearray):
        s = bytes(s)

    if isinstance(s, bytes):
        stream = InMemStream(s)
        stream.close()  # we don't intend to write anything
        return stream

    # s may still conform to the Stream interface. Yay duck typing.
    return s
