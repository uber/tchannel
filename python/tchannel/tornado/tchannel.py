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
import os
import sys

import tornado.gen
import tornado.ioloop
import tornado.iostream
import tornado.tcpserver
from tornado.netutil import bind_sockets

from enum import IntEnum

from ..errors import TChannelError
from ..event import EventEmitter
from ..event import EventRegistrar
from ..handler import CallableRequestHandler
from ..net import local_ip
from .connection import StreamConnection
from .stream import Stream
from .peer import PeerGroup

log = logging.getLogger('tchannel')


class State(IntEnum):
    ready = 0
    closing = 1
    closed = 2


class ProxyChannel(object):
    """A proxy object used to make requests through a TChannel.

    These proxy channels and the root TChannel allow deriving arbitrary
    levels of objects that remember certain pieces of TChannel configuration.

    For example,

    .. code-block:: python

        tchannel = TChannel()  # root TChannel

        foo = tchannel.with_options(
            hostport='localhost:4040', service='hello'
        )
        # Calls made through foo and any derived channels will not need the
        # hostport or service specified.

        bar = foo.with_options(headers={'Source': 'x'})
        # Calls made through bar and any derived channels will not need the
        # hostport or service specified, and will always include the header
        # ``Source: x``.
    """

    __slots__ = ('parent', 'options', '_closed')

    def __init__(self, tchannel, options):
        self.parent = tchannel
        self.options = options
        # We're currently using dictionaries to represent these options. If
        # performance ever becomes an issue, we can use a namedtuple of all
        # configuration parameters.

        self._closed = False

        # TODO: Zipkin tracing

    def call(self, **kwargs):
        """See :py:meth:`TChannel.call`."""
        # TODO: Check if the channel has been closed?

        opts = self.options.copy()
        if 'headers' in opts and 'headers' in kwargs:
            # FIXME: Special casing it like this is hacky. Find better
            # solution.
            opts['headers'].update(kwargs.pop('headers'))
        opts.update(kwargs)

        # TODO assign a Trace to the call
        return self.parent.call(**opts)

    def with_options(self, **kwargs):
        """See :py:meth:`TChannel.with_options`."""
        return ProxyChannel(self, kwargs)

    def close(self):
        """See :py:meth:`TChannel.close`.

        Closing a proxy channel (or the root TChannel) has the effect of also
        closing all derived channels.
        """
        self._closed = True
        # The connections don't need to be closed. The root TChannel will take
        # care of it as necessary.

    @property
    def closed(self):
        """Whether this channel has been closed.

        A channel is considered closed if ``.close`` was called on it or one
        of its parents.
        """
        return self._closed or self.parent.closed

    @property
    def hostport(self):
        """A host-port to reach this service.

        The service behind this TChannel can be reached at this address.
        """
        return self.parent.hostport

    # TODO: host() should respect scheme if specified. Better yet, replace
    # host() with register() to register individual endpoints and make that
    # respect the scheme.


class TChannel(object):
    """Manages inbound and outbound connections to various hosts."""

    def __init__(self, hostport=None, process_name=None, known_peers=None):
        """Build or re-use a TChannel.

        :param hostport:
            The host-port at which the service behind this TChannel is
            reachable. The port specified in the ``hostport`` is what the
            server will listen on. If unspecified, the system will attempt to
            determine the local network IP for this host and use an
            OS-assigned port.
        :param process_name:
            Name of this process. This is used for logging only. If
            unspecified, this will default to ``$processName[$processId]``.
        :param known_peers:
            A list of host-ports at which already known peers can be reached.
            Defaults to an empty list.
        """
        # TODO: handle Zipkin in here
        self._state = State.ready
        self.peers = PeerGroup(self)

        if hostport:
            self._host, port = hostport.rsplit(':', 1)
            self._port = int(port)
        else:
            self._host = local_ip()
            self._port = 0

        self.process_name = process_name or "%s[%s]" % (
            sys.argv[0], os.getpid()
        )

        # RequestHandler to handle incoming calls.
        self._handler = None

        # register event hooks
        self.event_emitter = EventEmitter()
        self.hooks = EventRegistrar(self.event_emitter)

        if known_peers:
            for peer_hostport in known_peers:
                self.peers.add(peer_hostport)

    def with_options(self, **kwargs):
        """Create a proxy to this TChannel that remembers the given settings.

        For example,

        .. code-block:: python

            tchannel = TChannel()
            foo_channel = tchannel.with_options(service='foo')
            # All requests made through foo_channel will have service=foo
            # unless otherwise specified
        """
        # TODO: Document params
        return ProxyChannel(self, kwargs)

    @property
    def closed(self):
        """Whether this TChannel was closed."""
        return self._state == State.closed

    @tornado.gen.coroutine
    def close(self):
        """Close this TChannel.

        All connections to all known peers will be disconnected.
        """
        if self._state in [State.closed, State.closing]:
            raise tornado.gen.Return(None)

        self._state = State.closing
        try:
            yield self.peers.clear()
        finally:
            self._state = State.closed

    @property
    def hostport(self):
        """The host-port at which this TChannel can be reached."""
        return "%s:%d" % (self._host, self._port)

    def request(self, hostport=None, service=None, **kwargs):
        """Initiate a new request through this TChannel.

        :param hostport:
            Host to which the request will be made. If unspecified,  a random
            known peer will be picked.
        :param service:
            Service being called. Defaults to an empty string.
        """
        return self.peers.request(hostport=hostport, service=service, **kwargs)

    def call(self, service, args, headers=None, hostport=None, scheme=None,
             **kwargs):
        # NOTE: headers are TRANSPORT HEADERS.
        # APPLICATION HEADERS go inside args[1]
        headers = headers or {}
        arg1, arg2, arg3 = args
        if scheme:
            headers['as'] = scheme.type()
            try:
                if not isinstance(arg2, Stream):
                    arg2 = scheme.serialize_header(arg2)
                if not isinstance(arg3, Stream):
                    arg3 = scheme.serialize_body(arg3)
            except Exception as e:
                raise TChannelError(e.message)

        return self.request(hostport=hostport, service=service).send(
            arg1=arg1,
            arg2=arg2,
            arg3=arg3,
            traceflag=False,  # TODO
            headers=headers,
        )

    def host(self, handler):
        """Specify the RequestHandler to handle incoming requests.

        Requests may be received via both, incoming and outgoing connections.

        :param handler:
            RequestHandler to handle incoming requests.
        :return:
            This TChannel instance to allow chaining requests to `host` and
            `listen`
        """
        self._handler = handler
        return self

    def listen(self):
        """Start listening for incoming connections.

        A request handler must have already been specified with
        ``TChannel.host``.
        """
        assert self._handler, "Call .host with a RequestHandler first"
        server = TChannelServer(self)

        sockets = bind_sockets(self._port)
        assert sockets, "No sockets bound for port %d" % self._port

        # If port was 0, the OS probably assigned something better.
        self._port = sockets[0].getsockname()[1]

        server.add_sockets(sockets)

    @tornado.gen.coroutine
    def receive_call(self, context, connection):
        if not self._handler:
            log.warn(
                "Received %s but a handler has not been defined.", context
            )
            return
        self._handler.handle(context, connection)


class TChannelServer(tornado.tcpserver.TCPServer):
    __slots__ = ('tchannel',)

    def __init__(self, tchannel):
        super(TChannelServer, self).__init__()
        self.tchannel = tchannel

    @tornado.gen.coroutine
    def handle_stream(self, stream, address):
        log.debug("New incoming connection from %s:%d" % address)

        conn = StreamConnection(connection=stream, tchannel=self.tchannel)

        yield conn.expect_handshake(headers={
            'host_port': self.tchannel.hostport,
            'process_name': self.tchannel.process_name,
        })

        log.debug(
            "Successfully completed handshake with %s:%s (%s)",
            conn.remote_host,
            conn.remote_host_port,
            conn.remote_process_name)

        self.tchannel.peers.get(
            "%s:%s" % (conn.remote_host,
                       conn.remote_host_port)
        ).register_incoming(conn)

        yield conn.serve(handler=CallableRequestHandler(self._handle))

    def _handle(self, context, connection):
        self.tchannel.receive_call(context, connection)
