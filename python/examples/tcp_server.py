#!/usr/bin/env python
from __future__ import absolute_import

try:
    import SocketServer
except ImportError:
    import socketserver as SocketServer

import sys

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

    def handle_call(self, connection, context, message):
        """Handle a TChannel CALL_REQ message."""
        print("Received message: %s" % message)


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8888
    server = SocketServer.TCPServer(("localhost", port), MyHandler)
    print("Listening on port %d..." % port)
    server.serve_forever()
