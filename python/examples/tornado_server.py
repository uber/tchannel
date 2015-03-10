#!/usr/bin/env python
from __future__ import absolute_import
import sys

import tornado.ioloop
import tornado.tcpserver

from options import get_args
from tchannel.tornado.connection import TornadoConnection


class MyServer(tornado.tcpserver.TCPServer):
    def handle_stream(self, stream, address):
        tchannel_connection = TornadoConnection(
            connection=stream
        )

        print("Received request from %s:%d" % address)

        print("Waiting for TChannel handshake...")
        tchannel_connection.await_handshake(headers={
            'host_port': '%s:%s' % address,
            'process_name': sys.argv[0],
        }, callback=self.handshake_complete)

    def handshake_complete(self, connection):
        print(
            "Successfully completed handshake with %s" %
            connection.remote_process_name
        )
        connection.handle_calls(self.handle_call)

    def handle_call(self, context, connection):
        """Handle a TChannel CALL_REQ message."""
        if not context:
            print("All done with connection")
            return

        print("Received message: %s" % context.message)
        connection.handle_calls(self.handle_call)


if __name__ == '__main__':
    args = get_args()
    server = MyServer()
    server.listen(args.port)
    print("Listening on port %d..." % args.port)
    tornado.ioloop.IOLoop.instance().start()
