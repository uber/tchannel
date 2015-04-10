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
import os
import socket
import sys

import tornado.gen
import tornado.iostream

try:
    import tornado.queues as queues  # included in 4.2
except ImportError:
    import toro as queues

from .. import glossary
from .. import frame
from .. import messages
from .. import exceptions
from ..io import BytesIO
from ..context import Context
from ..exceptions import ConnectionClosedException, InvalidErrorCodeException
from ..messages.types import Types
from ..messages.common import (
    PROTOCOL_VERSION, generate_checksum,  verify_checksum
)
from ..messages.error import ErrorMessage, ErrorCode
from .message_factory import MessageFactory


log = logging.getLogger('tchannel')


class TornadoConnection(object):
    """Manages a bi-directional TChannel conversation between two machines.

    The following primary bi-directional operations are provided:

    ``write(message)``
        Send the message up the wire.
    ``await(message)``
        Receive a message.
    ``send(message)``
        Send a message and receive its response.

    In addition to those, the following operations are provided and should be
    used depending on the direction of the connection.

    ``initiate_handshake``
        Perform a handshake with the remote host.
    ``expect_handshake``
        Expect a handshake request from the remote host.
    """

    CALL_TYPES = frozenset([Types.CALL_REQ, Types.CALL_REQ_CONTINUE])

    def __init__(self, connection):
        assert connection, "connection is required"

        self.closed = False
        self.connection = connection

        self.remote_host = None
        self.remote_process_name = None
        self.requested_version = PROTOCOL_VERSION

        # Tracks message IDs for this connection.
        self._id_sequence = 0

        # We need to use two separate message factories to avoid message ID
        # collision while assembling fragmented messages.
        self._request_message_factory = MessageFactory()
        self._response_message_factory = MessageFactory()

        # Queue of unprocessed incoming calls.
        self._messages = queues.Queue()

        # Map from message ID to futures for responses of outgoing calls.
        self._outstanding = {}

        # Whether _loop is running. The loop doesn't run until after the
        # handshake has been performed.
        self._loop_running = False

        connection.set_close_callback(self._on_close)

    def next_message_id(self):
        self._id_sequence = (self._id_sequence + 1) % glossary.MAX_MESSAGE_ID
        return self._id_sequence

    def _on_close(self):
        self.closed = True

        for message_id, future in self._outstanding.iteritems():
            future.set_exception(
                ConnectionClosedException(
                    "canceling outstanding request %d" % message_id
                )
            )
        self._outstanding = {}

        try:
            while True:
                message = self._messages.get_nowait()
                log.warn("Unconsumed message %s", message)
        except queues.Empty:
            pass

    def await(self):
        """Get the next call to this TChannel."""
        if self._loop_running:
            return self._messages.get()
        else:
            return self._recv()

    def _recv(self):
        """Receive the next message off the wire.

        :returns:
            A Future that produces a Context object containing the next
            message off the wire.
        """

        # This is the context we'll return for any inbound messages.
        context_future = tornado.gen.Future()

        def on_body(read_body_future, size):
            if read_body_future.exception():
                return on_error(read_body_future)

            body = read_body_future.result()
            f = frame.frame_rw.read(BytesIO(body), size=size)
            message_rw = messages.RW[f.header.message_type]
            message = message_rw.read(BytesIO(f.payload))
            context_future.set_result(Context(f.header.message_id, message))

        def on_read_size(read_size_future):
            if read_size_future.exception():
                return on_error(read_size_future)

            size_bytes = read_size_future.result()
            size = frame.frame_rw.size_rw.read(BytesIO(size_bytes))
            read_body_future = self.connection.read_bytes(size - size_width)
            read_body_future.add_done_callback(
                lambda future: on_body(future, size)
            )
            return read_body_future

        def on_error(future):
            exception = future.exception()

            if isinstance(exception, tornado.iostream.StreamClosedError):
                self.close()

        size_width = frame.frame_rw.size_rw.width()
        self.connection.read_bytes(size_width).add_done_callback(on_read_size)

        return context_future

    @tornado.gen.coroutine
    def _loop(self):
        # Receive messages off the wire. All messages are either responses to
        # outstanding requests or calls.
        #
        # Must be started only after the handshake has been performed.
        self._loop_running = True
        while not self.closed:
            context = yield self._recv()
            # TODO: There should probably be a try-catch on the yield.

            if context.message.message_type in self.CALL_TYPES:
                self._messages.put(context)
                continue
            elif context.message_id in self._outstanding:
                message = self._response_message_factory.build(
                    context.message_id, context.message
                )

                if message is None:
                    # Message fragment is incomplete. It'll probably be filled
                    # by a future request.
                    continue

                future = self._outstanding.pop(context.message_id)
                if future.running():
                    future.set_result(message)
                    continue
            log.warn('Unconsumed message %s', context)

    # Basically, the only difference between send and write is that send
    # sets up a Future to get the response. That's ideal for peers making
    # calls. Peers responding to calls must use write.

    def send(self, message, message_id=None):
        """Send the given message up the wire.

        Use this for messages which have a response message.

        :param message:
            Message to send
        :returns:
            A Future containing the response for the message
        """
        assert not self.closed
        assert self._loop_running, "Perform a handshake first."
        assert message.message_type in self.CALL_TYPES, (
            "Message '%s' can't use send" % repr(message)
        )

        message_id = message_id or self.next_message_id()
        assert message_id not in self._outstanding, (
            "Message ID '%d' already being used" % message_id
        )

        future = tornado.gen.Future()
        self._outstanding[message_id] = future
        self.write(message, message_id)
        return future

    @tornado.gen.coroutine
    def write(self, message, message_id=None):
        """Writes the given message up the wire.

        Does not expect a response back for the message.

        :param message:
            Message to write.
        """
        assert not self.closed
        message_id = message_id or self.next_message_id()
        fragments = self._request_message_factory.fragment(message)
        for fragment in fragments:
            yield self._write(fragment, message_id)

    def _write(self, message, message_id=None):
        """Writes the given message up the wire.

        The message must be small enough to fit in a single frame.
        """
        generate_checksum(message)
        message_id = message_id or self.next_message_id()

        payload = messages.RW[message.message_type].write(
            message, BytesIO()
        ).getvalue()

        f = frame.Frame(
            header=frame.FrameHeader(
                message_type=message.message_type,
                message_id=message_id,
            ),
            payload=payload
        )
        body = frame.frame_rw.write(f, BytesIO()).getvalue()
        return self.connection.write(body)

    def close(self):
        return self.connection.close()

    @tornado.gen.coroutine
    def initiate_handshake(self, headers):
        """Initiate a handshake with the remote host.

        :param headers:
            A dictionary of headers to send.
        :returns:
            A future that resolves (with a value of None) when the handshake
            is complete.
        """
        self._write(messages.InitRequestMessage(
            version=PROTOCOL_VERSION,
            headers=headers
        ))
        context = yield self._recv()
        init_res = context.message
        if init_res.message_type != Types.INIT_RES:
            raise exceptions.InvalidMessageException(
                "Expected handshake response, got %s" % repr(init_res)
            )
        self._extract_handshake_headers(init_res)

        # The receive loop is started only after the handshake has been
        # completed.
        self._loop()

    @tornado.gen.coroutine
    def expect_handshake(self, headers):
        """Expect a handshake from the remote host.

        :param headers:
            Headers to respond with
        :returns:
            A future that resolves (with a value of None) when the handshake
            is complete.
        """
        context = yield self._recv()
        init_req = context.message
        if init_req.message_type != Types.INIT_REQ:
            raise exceptions.InvalidMessageException(
                "You need to shake my hand first. Got %s" % repr(init_req)
            )
        self._extract_handshake_headers(init_req)

        self._write(
            messages.InitResponseMessage(PROTOCOL_VERSION, headers),
            context.message_id
        )

        # The receive loop is started only after the handshake has been
        # completed.
        self._loop()

    def _extract_handshake_headers(self, message):
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

    @classmethod
    @tornado.gen.coroutine
    def outgoing(cls, hostport, process_name=None, serve_hostport=None,
                 handler=None):
        """Initiate a new connection to the given host.

        :param hostport:
            String in the form ``$host:$port`` specifying the target host
        :param process_name:
            Process name of the entity making the connection.
        :param serve_hostport:
            String in the form ``$host:$port`` specifying an address at which
            the caller can be reached. If omitted, ``0.0.0.0:0`` is used.
        :param handler:
            If given, any calls received from this connection will be sent to
            this RequestHandler.
        """
        host, port = hostport.rsplit(":", 1)
        process_name = process_name or "%s[%s]" % (sys.argv[0], os.getpid())
        serve_hostport = serve_hostport or "0.0.0.0:0"

        # TODO: change this to tornado.tcpclient.TCPClient to do async DNS
        # lookups.
        stream = tornado.iostream.IOStream(
            socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        )

        log.debug("Connecting to %s", hostport)
        try:
            yield stream.connect((host, int(port)))
        except socket.error as e:
            log.exception("Couldn't connect to %s", hostport)
            raise ConnectionClosedException(
                "Couldn't connect to %s" % hostport, e
            )

        connection = cls(stream)
        log.debug("Performing handshake with %s", hostport)
        yield connection.initiate_handshake(headers={
            'host_port': serve_hostport,
            'process_name': process_name,
        })

        if handler:
            connection.serve(handler)

        raise tornado.gen.Return(connection)

    @tornado.gen.coroutine
    def serve(self, handler):
        """Serve calls over this connection using the given RequestHandler.

        :param handler:
            RequestHandler to process the requests through
        :return:
            A Future that resolves (to None) once the loop is done running --
            which happens once this connection is closed.
        """
        assert handler, "handler is required"
        assert self._loop_running, "Finish the handshake first"

        while not self.closed:
            context = yield self.await()
            message = self._request_message_factory.build(
                context.message_id, context.message
            )

            if message is None:
                # Message fragment is incomplete. It'll probably be filled by
                # a future request.
                continue

            if not verify_checksum(message):
                self.senderror(
                    ErrorCode.bad_request,
                    "Checksum does not match.",
                    context.message_id,
                )
                continue

            try:
                handler.handle(Context(context.message_id, message), self)
            except Exception:
                # TODO Send error frame back
                logging.exception("Failed to process %s", repr(context))

    def senderror(self, code, message, message_id):
        """Convenience method for writing Error frames up the wire.

        :param code:
            Error code
        :param message:
            Error message
        :param message_id:
            Message in response to which this error is being sent
        """
        if code not in ErrorMessage.ERROR_CODES.keys():
            raise InvalidErrorCodeException(code)

        self._write(
            ErrorMessage(
                code=ErrorCode.bad_request,
                message=message
            ),
            message_id
        )

    def ping(self):
        return self._write(messages.PingRequestMessage())

    def pong(self):
        return self._write(messages.PingResponseMessage())
