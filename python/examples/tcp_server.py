#!/usr/bin/env python
from __future__ import absolute_import

try:
    import SocketServer
except ImportError:
    import socketserver as SocketServer

import sys

from tchannel.socket import SocketConnection

from handler import get_example_handler
from options import get_args


class MyHandler(SocketServer.BaseRequestHandler):

    def handle(self):
        """Implement the BaseRequestHandler interface.

        ``self.request`` is the TCP socket connected to the client.
        """
        self.request.settimeout(1.0)

        tchannel_connection = SocketConnection(connection=self.request)

        tchannel_connection.await_handshake(headers={
            'host_port': '%s:%s' % self.request.getsockname(),
            'process_name': sys.argv[0],
        })

        handler = get_example_handler()

        tchannel_connection.handle_calls(handler)


if __name__ == '__main__':
    args = get_args()

    server = SocketServer.TCPServer((args.host, args.port), MyHandler)
    print("Listening on port %d..." % args.port)
    server.serve_forever()
