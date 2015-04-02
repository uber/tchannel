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

import os
import sys
import logging

import tornado.ioloop
import tornado.tcpserver

from ..context import Context
from ..tornado.connection import TornadoConnection
from ..exceptions import InvalidChecksumException
from ..messages.common import verify_checksum
from .message_factory import MessageFactory


class TChannelServer(tornado.tcpserver.TCPServer):
    """Implements a basic Tornado-based TChannel server.

    The server behavior is defined by using a ``RequestHandler``."""

    def __init__(self, handler, process_name=None):
        """Instantiate the server with the given handler.

        :param handler: RequestHandler to handle incoming requests
        """
        assert handler is not None
        super(TChannelServer, self).__init__()

        self.handler = handler
        self.message_factory = MessageFactory()
        self.process_name = process_name or "%s[%s]" % (
            sys.argv[0], os.getpid()
        )

    def handle_stream(self, stream, address):
        logging.debug("New incoming connection from %s:%d" % address)

        def handle_message(context, connection):
            message = self.message_factory.build(context.message_id,
                                                 context.message)
            if message is None:
                # Message frogment incomplete. It'll probably be filled by a
                # future request.
                return

            if not verify_checksum(message):
                # TODO: Probably send an Error frame back
                raise InvalidChecksumException()

            self.handler.handle(
                Context(context.message_id, message),
                connection,
            )

        def handshake_complete(connection):
            logging.debug('Successfully completed handshake with %s',
                          connection.remote_process_name)
            connection.handle_calls(handle_message)

        connection = TornadoConnection(connection=stream)
        connection.await_handshake(headers={
            # FIXME: This should probably be our own address.
            'host_port': '%s:%s' % address,
            'process_name': self.process_name,
        }, callback=handshake_complete)
