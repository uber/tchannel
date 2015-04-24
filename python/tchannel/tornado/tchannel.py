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

import sys
import logging

from enum import IntEnum
import os
import tornado.gen
import tornado.ioloop
import tornado.tcpserver
import tornado.iostream
from tornado.netutil import bind_sockets

from ..net import local_ip
from .peer import PeerGroup
from .connection import StreamConnection
from ..handler import CallableRequestHandler

log = logging.getLogger('tchannel')


class State(IntEnum):
    ready = 0
    closing = 1
    closed = 2


class TChannel(object):
    """Manages inbound and outbound connections to various hosts.

    This class is a singleton. All instances of it are the same. If you need
    separate instances, use the ``ignore_singleton`` argument.
    """

    def __init__(self, hostport=None, process_name=None):
        """Build or re-use a TChannel.

        :param hostport:
            The hostport at which the service hosted behind this TChannel can
            be reached.
        :param ignore_singleton:
            If given, this instance will not re-use the existing singleton.
        """
        self._state = State.ready
        self.peers = PeerGroup(self)

        if hostport:
            self.host, port = hostport.rsplit(':', 1)
            self.port = int(port)
        else:
            self.host = local_ip()
            self.port = 0

        self.process_name = process_name or "%s[%s]" % (
            sys.argv[0], os.getpid()
        )

        # RequestHandler to handle incoming calls.
        self._handler = None

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
        return "%s:%d" % (self.host, self.port)

    def request(self, hostport=None, service=None, **kwargs):
        return self.peers.request(hostport=hostport, service=service, **kwargs)

    def listen(self, handler):
        assert (
            not self._handler or self._handler is handler
        ), "TChannel already has a handler set."

        self._handler = handler
        server = TChannelServer(self)

        sockets = bind_sockets(self.port)
        assert sockets, "No sockets bound for port %d" % self.port

        # If port was 0, the OS probably assigned something better.
        self.port = sockets[0].getsockname()[1]

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
        # TODO peer how do
        conn = StreamConnection(connection=stream)

        # FIXME: This should the address at which we can be reached.
        yield conn.expect_handshake(headers={
            'host_port': '%s:%s' % address,
            'process_name': self.tchannel.process_name,
        })

        log.debug(
            "Successfully completed handshake with %s (%s)",
            conn.remote_host,
            conn.remote_process_name,
        )

        self.tchannel.peers.get(conn.remote_host).register_incoming(conn)
        yield conn.serve(handler=CallableRequestHandler(self._handle))

    def _handle(self, context, connection):
        self.tchannel.receive_call(context, connection)
