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

import socket
import sys
import tornado.ioloop
import tornado.tcpserver
from ..context import Context

from ..tornado.connection import TornadoConnection
from ..exceptions import InvalidChecksumException
from ..messages.common import verify_checksum
from .message_factory import MessageFactory


class InboundServer(tornado.tcpserver.TCPServer):
    def __init__(self, req_handler):
        super(InboundServer, self).__init__()

        assert req_handler is not None
        self.req_handler = req_handler

        self.message_factory = MessageFactory()

    def build_stream(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect(self.server_address)

    def handle_stream(self, stream, address):
        tchannel_connection = TornadoConnection(
            connection=stream
        )

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

        :param context: a context contains call request message
        :param conn: incoming tornado connection
        """

        message = self.message_factory.build(context.message_id,
                                             context.message)
        if message is not None:
            if verify_checksum(message):
                self.req_handler.handle_request(
                    Context(context.message_id, message),
                    conn)
            else:
                # TODO return Error message
                raise InvalidChecksumException()
        else:
            # buffer streaming frames
            conn.handle_calls(self.preprocess_request)
