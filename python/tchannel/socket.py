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

import logging
import socket

from . import exceptions
from . import messages
from .exceptions import ConnectionClosedException
from .frame_reader import FrameReader
from .frame_reader import FrameWriter
from .messages.common import PROTOCOL_VERSION
from .messages.types import Types
from .tornado.message_factory import MessageFactory


log = logging.getLogger('tchannel')


class _SocketIOAdapter(object):
    """Represent a ``socket.socket`` instance as a buffer."""
    def __init__(self, connection):
        self._connection = connection

    def read(self, size):
        result = self._connection.recv(size)

        remaining = size - len(result)

        # Ensure that we read as much data as was requested.
        if remaining > 0:
            chunks = [result]
            while remaining > 0:
                s = self._connection.recv(remaining)

                if not s:  # end of stream reached
                    break

                remaining -= len(s)
                chunks.append(s)
            result = "".join(chunks)

        return result

    def write(self, data):
        return self._connection.sendall(data)

    def close(self):
        self._connection.close()


class SocketConnection(object):
    """Adapt a ``socket.socket`` connection as a TChannel connection.

    Use this class to perform synchronous socket operations, e.g. over TCP or a
    Unix Domain Socket.
    """
    def __init__(self, connection):
        self.connection = _SocketIOAdapter(connection)
        self.writer = FrameWriter(self.connection)
        self.reader = FrameReader(self.connection).read()
        self.closed = False
        self.message_factory = MessageFactory()
        self._id_sequence = 0

    def handle_calls(self, handler):
        """Hande incoming calls syncronously using the given RequestHandler."""
        for context in self.reader:
            handler.handle(context, self)

    def await(self):
        """Decode a full message and return"""
        try:
            ctx = next(self.reader)
        except StopIteration:
            ctx = None
        except socket.timeout:
            ctx = None
        except socket.error as e:
            log.warn('socket error while reading: %s', e)
            self.close()
            raise ConnectionClosedException("failed to read")

        return ctx

    def next_message_id(self):
        """Generate a new message ID."""
        self._id_sequence += 1
        return self._id_sequence

    @classmethod
    def outgoing(cls, hostport):
        host, port = hostport.rsplit(":", 1)

        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.connect((host, int(port)))

        conn = cls(sock)

        conn.initiate_handshake(headers={
            'host_port': '%s:%s' % (host, port),
            'process_name': 'tchannel_client-%s' % port
        })
        conn.await_handshake_reply()
        return conn

    @classmethod
    def incoming(cls, hostport, handler):
        raise NotImplementedError

    def close(self):
        self.closed = True
        return self.connection.close()

    def frame_and_write_stream(self, message, message_id=None):
        message_id = message_id or self.next_message_id()
        fragment_msgs = self.message_factory.fragment(message)
        for fragment in fragment_msgs:
            self.frame_and_write(fragment, message_id)

    def frame_and_write(self, message, message_id=None):
        """Frame and write a message over a connection."""
        if message_id is None:
            message_id = self.next_message_id()
        try:
            self.writer.write(message_id, message)
        except exceptions.ProtocolException as e:
            raise exceptions.InvalidMessageException(e.message)
        except socket.error as e:
            log.warn('socket error while writing: %s', e)
            self.close()
            raise ConnectionClosedException("failed to write")

        return message_id

    def ping(self):
        """Send a PING_REQ message to the remote end of the connection."""
        message = messages.PingRequestMessage()
        return self.frame_and_write(message)

    def pong(self, message_id):
        """Reply to a PING_REQ message with a PING_RES."""
        message = messages.PingResponseMessage()
        return self.frame_and_write(message, message_id=message_id)

    def await_handshake(self, headers):
        """Negotiate a common protocol version with a client."""
        ctx = self.await()
        if not ctx:
            raise exceptions.TChannelException("Connection was closed.")

        message = ctx.message
        if message.message_type != Types.INIT_REQ:
            raise exceptions.InvalidMessageException(
                'You need to shake my hand first. Got: %d' %
                message.message_type,
            )
        self.extract_handshake_headers(message)
        response = messages.InitResponseMessage(PROTOCOL_VERSION, headers)
        return self.frame_and_write(response, message_id=ctx.message_id)

    def extract_handshake_headers(self, message):
        """Extract TChannel headers from a handshake."""
        if not message.host_port:
            raise exceptions.InvalidMessageException(
                'Missing required header: host_port'
            )

        if not message.process_name:
            raise exceptions.InvalidMessageException(
                'Missing required header: process_name'
            )

        self.remote_host = message.host_port
        self.remote_process_name = message.process_name
        self.requested_version = message.version

    def initiate_handshake(self, headers):
        """Send a handshake offer to a server."""
        message = messages.InitRequestMessage(
            version=PROTOCOL_VERSION,
            headers=headers
        )
        self.handshake_headers = headers
        return self.frame_and_write(message)

    def await_handshake_reply(self):
        context = self.await()
        if not context:
            raise exceptions.TChannelException("Connection was closed.")
        message = context.message
        if message.message_type != Types.INIT_RES:
            raise exceptions.InvalidMessageException(
                'Expected handshake response, got %d' %
                message.message_type,
            )

        self.extract_handshake_headers(message)
        return message
