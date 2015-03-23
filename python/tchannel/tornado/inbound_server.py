#!/usr/bin/env python
from __future__ import absolute_import

import sys
import tornado.ioloop
import tornado.tcpserver
import socket

from tchannel.tornado.connection import TornadoConnection


class InboundServer(tornado.tcpserver.TCPServer):
    def __init__(self, req_handler):
        super(InboundServer, self).__init__()

        assert req_handler is not None
        self.req_handler = req_handler
        self.peers = {}

    def build_stream(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect(self.server_address)

    def handle_stream(self, stream, address):
        tchannel_connection = TornadoConnection(
            connection=stream
        )
        self.peers[tchannel_connection] = self.req_handler
        print "Inbound Server handle stream"

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
        connection.handle_calls(self.preprocess_request)

    def preprocess_request(self, context, conn):
        """ call handler to process request

        :param context: incoming msg context
        :param conn: incoming connection
        """
        self.peers[conn].handle_request(context, conn)
