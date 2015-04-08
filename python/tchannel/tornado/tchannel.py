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
import threading
import weakref

import os
import tornado.gen
import tornado.ioloop
import tornado.tcpserver
import tornado.iostream


try:
    from tornado import queues
except ImportError:
    import toro as queues

from .timeout import timeout
from .connection import TornadoConnection
from ..handler import CallableRequestHandler
from ..messages import CallRequestMessage
from ..exceptions import InvalidMessageException

log = logging.getLogger('tchannel')


class TChannel(object):
    """Manages inbound and outbound connections to various hosts.

    This class is a singleton. All instances of it are the same. If you need
    separate instances, use the ``ignore_singleton`` argument.
    """

    # We don't want to duplicate outgoing connections, so all instances of this
    # class will be a singleton.
    _singleton = threading.local()

    class __metaclass__(type):

        def __call__(cls, *args, **kwargs):
            # The constructor doesn't actually accept a ignore_singleton
            # argument. We remove the argument from kwargs if it's present.
            ignore_singleton = kwargs.pop('ignore_singleton', False)
            if hasattr(cls._singleton, "instance") and not ignore_singleton:
                return cls._singleton.instance
            chan = type.__call__(cls, *args, **kwargs)
            if not ignore_singleton:
                cls._singleton.instance = chan
            return chan

    def __init__(self, hostport=None, process_name=None):
        """Build or re-use a TChannel.

        :param hostport:
            The hostport at which the service hosted behind this TChannel can
            be reached.
        :param ignore_singleton:
            If given, this instance will not re-use the existing singleton.
        """
        self.closed = False
        self._hostport = hostport
        self.process_name = process_name or "%s[%s]" % (
            sys.argv[0], os.getpid()
        )

        # Map of hostport to TornadoConnection to that host.
        self.out_peers = {}
        # TODO: This should be a list so that we can make multiple outgoing
        # connection to the same host.

        # List of (hostport, TornadoConnection) for different hosts. This is
        # a list because we expect multiple connections from the same host.
        self.in_peers = []

        # RequestHandler to handle calls.
        self._handler = None

        # Queue of (context, connection) for all outstanding calls. The
        # context must contain complete actionable messages, not fragments.
        self.outstanding_calls = queues.Queue()

        self._loop()

    def close(self):
        self.closed = True
        # TODO close all connections

    @tornado.gen.coroutine
    def _loop(self):
        while not self.closed:
            (context, connection) = yield self.outstanding_calls.get()
            self._handler.handle(context, connection)

    # TODO: Connection cleanup

    def get_peer(self, hostport):
        """Get a connection to the given host.

        If a connection to or from that host already exists, use that;
        otherwise create a new outgoing connection to it.

        :param hostport:
            Target host
        :return:
            A Future that produces a TornadoConnection
        """
        if hostport in self.out_peers:
            return self.out_peers[hostport]

        matches = [conn for (h, conn) in self.in_peers if h == hostport]
        if matches:
            log.debug("Re-using incoming connection from %s", hostport)
            return tornado.gen.maybe_future(matches[0])
            # TODO: should this be random instead?
        else:
            log.debug("Creating new connection to %s", hostport)
            self.out_peers[hostport] = TornadoConnection.outgoing(
                hostport,
                serve_hostport=self._hostport,
                handler=CallableRequestHandler(self._handle_client_call),
            )
            return self.out_peers[hostport]

    def request(self, hostport, service=None):
        return TChannelClientOperation(hostport, service, self)

    def host(self, handler):
        self._handler = handler
        return TChannelServerOperation(self)

    def _handle_client_call(self, context, connection):
        self.outstanding_calls.put((context, connection))


class CallableTCPServer(tornado.tcpserver.TCPServer):
    def __init__(self, f):
        super(CallableTCPServer, self).__init__()
        assert f
        self._f = f

    def handle_stream(self, stream, address):
        return self._f(stream, address)


class TChannelServerOperation(object):
    __slots__ = ('tchannel',)

    def __init__(self, tchannel):
        self.tchannel = weakref.ref(tchannel)

    def listen(self, port):
        CallableTCPServer(self._handle_stream).listen(port)

    @tornado.gen.coroutine
    def _handle_stream(self, stream, address):
        log.debug("New incoming connection from %s:%d" % address)
        conn = TornadoConnection(connection=stream)

        # FIXME: This should the address at which we can be reached.
        yield conn.expect_handshake(headers={
            'host_port': '%s:%s' % address,
            'process_name': self.tchannel().process_name,
        })

        log.debug(
            "Successfully completed handshake with %s (%s)",
            conn.remote_host,
            conn.remote_process_name,
        )

        self.tchannel().in_peers.append((conn.remote_host, conn))
        # TODO cleanup on connection close?

        yield conn.serve(handler=CallableRequestHandler(self._handle))

    def _handle(self, context, connection):
        self.tchannel().outstanding_calls.put((context, connection))


class TChannelClientOperation(object):
    __slots__ = ('hostport', 'message_id', 'service', 'tchannel')

    def __init__(self, hostport, service, tchannel):
        self.hostport = hostport
        self.message_id = None
        self.service = service or ''
        self.tchannel = weakref.ref(tchannel)

    @tornado.gen.coroutine
    def send(self, arg_1, arg_2, arg_3):
        peer_connection = yield self.tchannel().get_peer(self.hostport)
        self.message_id = message_id = peer_connection.next_message_id()

        def safebytes(arg):
            if arg is None:
                return None
            if isinstance(arg, bytes):
                return arg
            return bytes(arg.encode('ascii'))

        message = CallRequestMessage(
            service=self.service,
            args=[safebytes(arg_1), arg_3, arg_3],
        )

        response_future = peer_connection.send(message, message_id)
        with timeout(response_future):
            response = yield response_future

        log.debug("Got response %s", response)

        if not response:
            raise InvalidMessageException()

        raise tornado.gen.Return(response)
