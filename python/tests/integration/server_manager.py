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

import threading
try:
    import SocketServer
except ImportError:
    import socketserver as SocketServer
from contextlib import contextmanager

import tornado

from tchannel.handler import TChannelRequestHandler
import tchannel.tornado.tchannel as tornado_tchannel
import tchannel.socket as socket_tchannel


class Expectation(object):
    """Represents an expectation for the ServerManager."""
    def __init__(self):
        # raw message to respond with
        self.response = None

    def and_return(self, resp):
        """Write the given Message as a response."""
        self.response = resp


class ServerManager(object):
    TIMEOUT = 0.15

    def __init__(self, port, timeout=None):
        self.port = port
        self.timeout = timeout or self.TIMEOUT
        self.handler = TChannelRequestHandler()

        self.thread = None
        self.ready = False

    def expect_call(self, endpoint):
        if not isinstance(endpoint, bytes):
            endpoint = bytes(endpoint, 'ascii')

        expectation = Expectation()

        def handle_expected_endpoint(request, response, opts):
            response.message = expectation.response

        self.handler.register(endpoint, handle_expected_endpoint)

        return expectation

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, *args):
        self.stop()

    def start(self):
        assert self.thread is None, 'server already started'
        self.thread = threading.Thread(target=self.serve)
        self.thread.start()
        while not self.ready:
            pass

    def stop(self):
        self.shutdown()
        self.thread.join()


class TCPServerManager(ServerManager):
    """Provides a dynamically configurable TChannel server."""

    def __init__(self, port, timeout=None):
        super(TCPServerManager, self).__init__(port, timeout)

        manager = self

        class Handler(SocketServer.BaseRequestHandler):
            def setup(self):
                self.request.settimeout(manager.timeout)
                self.tchan_conn = socket_tchannel.SocketConnection(
                    self.request,
                )

            def handle(self):
                (host, port) = self.request.getsockname()
                self.tchan_conn.await_handshake(headers={
                    'host_port': '%s:%s' % (host, port),
                    'process_name': 'tchannel_server-%s' % port
                })
                self.tchan_conn.handle_calls(manager.handler)

        self.server = SocketServer.TCPServer(("", port), Handler)

    @contextmanager
    def client_connection(self):
        """Get an initiated Connection to this TChannel server."""
        conn = None
        try:
            conn = socket_tchannel.SocketConnection.outgoing(
                'localhost:%d' % self.port
            )
            yield conn
        finally:
            if conn is not None:
                conn.close()

    def serve(self):
        self.ready = True
        self.server.serve_forever()

    def shutdown(self):
        self.server.shutdown()


class TChannelServerManager(ServerManager):

    def __init__(self, port, timeout=None):
        super(TChannelServerManager, self).__init__(port, timeout)

        self.tchannel = tornado_tchannel.TChannel()
        self.server = self.tchannel.host(port, self.handler)

    def serve(self):
        self.server.listen()
        self.ready = True
        tornado.ioloop.IOLoop.current().start()

    def shutdown(self):
        tornado.ioloop.IOLoop.current().stop()
