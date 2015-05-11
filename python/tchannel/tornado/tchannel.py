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

from ..event import EventEmitter
from ..event import EventRegistrar
from ..handler import CallableRequestHandler
from ..net import local_ip
from .connection import StreamConnection
from .peer import PeerGroup

log = logging.getLogger('tchannel')


class State(IntEnum):
    ready = 0
    closing = 1
    closed = 2


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

    @property
    def closed(self):
        return self._state == State.closed

    @tornado.gen.coroutine
    def close(self):
        if self._state in [State.closed, State.closing]:
            raise tornado.gen.Return(None)

        self._state = State.closing
        try:
            yield self.peers.clear()
        finally:
            self._state = State.closed

    @property
    def hostport(self):
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
