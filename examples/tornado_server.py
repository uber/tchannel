#!/usr/bin/env python
from __future__ import absolute_import
import sys

import tornado.ioloop
import tornado.tcpserver

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

    def handle_call(self, data, connection):
        """Handle a TChannel CALL_REQ message."""
        if not data:
            print("All done with connection")
            return

        frame, message = data
        print("Received message: %s" % message)
        connection.handle_calls(self.handle_call)


if __name__ == '__main__':
    port = 8888
    server = MyServer()
    server.listen(port)
    print("Listening on port %d..." % port)
    tornado.ioloop.IOLoop.instance().start()
