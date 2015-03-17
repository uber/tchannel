#!/usr/bin/env python
from __future__ import absolute_import

import sys

import tornado.tcpserver

from tchannel.tornado.connection import TornadoConnection


class InboundServer(tornado.tcpserver.TCPServer):

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
        # TODO add dispatch handler after handshake complete
        connection.handle_calls(self.handle_call)

    def handle_call(self, context, connection):
        # TODO replace this function with request handlers
        connection.handle_calls(self.handle_call)
