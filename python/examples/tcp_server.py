#!/usr/bin/env python
from __future__ import absolute_import

try:
    import SocketServer
except ImportError:
    import socketserver as SocketServer

import sys

from options import get_args
from tchannel.socket import SocketConnection


class MyHandler(SocketServer.BaseRequestHandler):
    def handle(self):
        """Implement the BaseRequestHandler interface.

        ``self.request`` is the TCP socket connected to the client.
        """
        self.request.settimeout(1.0)
        tchannel_connection = SocketConnection(connection=self.request)
        print("Received request from %s:%d" % self.client_address)

        print("Waiting for TChannel handshake...")
        tchannel_connection.await_handshake(headers={
            'host_port': '%s:%s' % self.request.getsockname(),
            'process_name': sys.argv[0],
        })
        print("Successfully completed handshake")

        # This call synchronously dispatches RPC requests to
        # ``self.handle_call``
        tchannel_connection.handle_calls(self.handle_call)

        # Connection is automatically closed when this function returns
        print("Closing connection to %s:%d" % self.client_address)

    def handle_call(self, context, connection):
        """Handle a TChannel CALL_REQ message."""
        print("Received message: %s" % context.message)


if __name__ == '__main__':
    args = get_args()

    server = SocketServer.TCPServer((args.host, args.port), MyHandler)
    print("Listening on port %d..." % args.port)
    server.serve_forever()
