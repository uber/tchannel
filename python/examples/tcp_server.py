#!/usr/bin/env python

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
