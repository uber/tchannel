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
from Queue import Empty

import tornado.gen
import tornado.iostream

from .. import errors
from .. import frame
from .. import glossary
from .. import messages
from ..errors import ConnectionClosedError
from ..errors import InvalidErrorCodeError
from ..errors import TChannelError
from ..event import EventType
from ..io import BytesIO
from ..messages.common import PROTOCOL_VERSION
from ..messages.common import FlagsType
from ..messages.common import StreamState
from ..messages.error import ErrorMessage
from ..messages.types import Types
from .message_factory import MessageFactory
from .message_factory import build_protocol_exception

try:
    import tornado.queues as queues  # included in 4.2
except ImportError:
    import toro as queues

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

    CALL_REQ_TYPES = frozenset([Types.CALL_REQ, Types.CALL_REQ_CONTINUE])
    CALL_RES_TYPES = frozenset([Types.CALL_RES, Types.CALL_RES_CONTINUE])

    def __init__(self, connection, tchannel=None):
        assert connection, "connection is required"

        self.closed = False
        self.connection = connection

        sockname = connection.socket.getsockname()
        if len(sockname) == 2:
            (self.remote_host,
             self.remote_host_port) = sockname
        elif len(sockname) == 1:
            self.remote_host = sockname[0]
            self.remote_host_port = 0
        else:
            self.remote_host = "0.0.0.0"
            self.remote_host_port = 0

        self.remote_host_port = int(self.remote_host_port)
        self.remote_process_name = None
        self.requested_version = PROTOCOL_VERSION

        # Tracks message IDs for this connection.
        self._id_sequence = 0

        # We need to use two separate message factories to avoid message ID
        # collision while assembling fragmented messages.
        self.request_message_factory = MessageFactory(self.remote_host,
                                                      self.remote_host_port)
        self.response_message_factory = MessageFactory(self.remote_host,
                                                       self.remote_host_port)

        # Queue of unprocessed incoming calls.
        self._messages = queues.Queue()

        # Map from message ID to futures for responses of outgoing calls.
        self._outstanding = {}

        # Whether _loop is running. The loop doesn't run until after the
        # handshake has been performed.
        self._loop_running = False

        self.tchannel = tchannel

        connection.set_close_callback(self._on_close)

    def next_message_id(self):
        self._id_sequence = (self._id_sequence + 1) % glossary.MAX_MESSAGE_ID
        return self._id_sequence

    def _on_close(self):
        self.closed = True

        for message_id, future in self._outstanding.iteritems():
            future.set_exception(
                ConnectionClosedError(
                    "canceling outstanding request %d" % message_id
                )
            )
        self._outstanding = {}

        try:
            while True:
                message = self._messages.get_nowait()
                log.warn("Unconsumed message %s", message)
        except Empty:
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

        # This is the message_future we'll return for any inbound messages.
        message_future = tornado.gen.Future()

        def on_body(read_body_future, size):
            if read_body_future.exception():
                return on_error(read_body_future)

            body = read_body_future.result()
            f = frame.frame_rw.read(BytesIO(body), size=size)
            message_rw = messages.RW[f.header.message_type]
            message = message_rw.read(BytesIO(f.payload))
            message.id = f.header.message_id
            message_future.set_result(message)

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

        return message_future

    @tornado.gen.coroutine
    def _loop(self):
        # Receive messages off the wire. All messages are either responses to
        # outstanding requests or calls.
        #
        # Must be started only after the handshake has been performed.
        self._loop_running = True
        while not self.closed:
            message = yield self._recv()
            # TODO: There should probably be a try-catch on the yield.
            if message.message_type in self.CALL_REQ_TYPES:
                self._messages.put(message)
                continue

            elif message.id in self._outstanding:
                # set exception if receive error message
                if message.message_type == Types.ERROR:
                    future = self._outstanding.pop(message.id)
                    if future.running():
                        protocol_exception = build_protocol_exception(message)
                        future.set_exception(protocol_exception)
                    else:
                        protocol_exception = (
                            self.response_message_factory.build(message)
                        )
                        if protocol_exception:
                            self.event_emitter.fire(
                                EventType.after_receive_error,
                                protocol_exception,
                            )
                    continue

                response = self.response_message_factory.build(message)

                # keep continue message in the list
                # pop all other type messages including error message
                if (message.message_type in self.CALL_RES_TYPES and
                        message.flags == FlagsType.fragment):
                    # still streaming, keep it for record
                    future = self._outstanding.get(message.id)
                else:
                    future = self._outstanding.pop(message.id)

                if response and future.running():
                    future.set_result(response)
                continue

            log.warn('Unconsumed message %s', message)

    # Basically, the only difference between send and write is that send
    # sets up a Future to get the response. That's ideal for peers making
    # calls. Peers responding to calls must use write.
    def send(self, message):
        """Send the given message up the wire.
        Use this for messages which have a response message.

        :param message:
            Message to send
        :returns:
            A Future containing the response for the message
        """
        assert not self.closed
        assert self._loop_running, "Perform a handshake first."
        assert message.message_type in self.CALL_REQ_TYPES, (
            "Message '%s' can't use send" % repr(message)
        )

        message.id = message.id or self.next_message_id()
        assert message.id not in self._outstanding, (
            "Message ID '%d' already being used" % message.id
        )

        future = tornado.gen.Future()
        self._outstanding[message.id] = future
        self.write(message)
        return future

    @tornado.gen.coroutine
    def write(self, message):
        """Writes the given message up the wire.

        Does not expect a response back for the message.

        :param message:
            Message to write.
        """
        assert not self.closed

        message.id = message.id or self.next_message_id()

        if message.message_type in self.CALL_REQ_TYPES:
            message_factory = self.request_message_factory
        else:
            message_factory = self.response_message_factory

        fragments = message_factory.fragment(message)
        for fragment in fragments:
            yield self._write(fragment)

    def _write(self, message):
        """Writes the given message up the wire.

        The message must be small enough to fit in a single frame.
        """
        message.id = message.id or self.next_message_id()

        payload = messages.RW[message.message_type].write(
            message, BytesIO()
        ).getvalue()

        f = frame.Frame(
            header=frame.FrameHeader(
                message_type=message.message_type,
                message_id=message.id,
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
        init_res = yield self._recv()
        if init_res.message_type != Types.INIT_RES:
            raise errors.InvalidMessageError(
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
        init_req = yield self._recv()
        if init_req.message_type != Types.INIT_REQ:
            raise errors.InvalidMessageError(
                "You need to shake my hand first. Got %s" % repr(init_req)
            )
        self._extract_handshake_headers(init_req)

        self._write(
            messages.InitResponseMessage(
                PROTOCOL_VERSION, headers, init_req.id),
        )

        # The receive loop is started only after the handshake has been
        # completed.
        self._loop()

    def _extract_handshake_headers(self, message):
        if not message.host_port:
            raise errors.InvalidMessageError(
                'Missing required header: host_port'
            )

        if not message.process_name:
            raise errors.InvalidMessageError(
                'Missing required header: process_name'
            )

        (self.remote_host,
         self.remote_host_port) = message.host_port.rsplit(':', 1)
        self.remote_host_port = int(self.remote_host_port)
        self.remote_process_name = message.process_name
        self.requested_version = message.version

    @classmethod
    @tornado.gen.coroutine
    def outgoing(cls, hostport, process_name=None, serve_hostport=None,
                 handler=None, tchannel=None):
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
            raise ConnectionClosedError(
                "Couldn't connect to %s" % hostport, e
            )

        connection = cls(stream, tchannel)
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
            message = yield self.await()

            try:
                handler.handle(message, self)
            except Exception:
                # TODO Send error frame back
                logging.exception("Failed to process %s", repr(message))

    def send_error(self, code, description, message_id):
        """Convenience method for writing Error frames up the wire.

        :param code:
            Error code
        :param description:
            Error description
        :param message_id:
            Message in response to which this error is being sent
        """
        if code not in ErrorMessage.ERROR_CODES.keys():
            raise InvalidErrorCodeError(code)

        return self._write(
            ErrorMessage(
                code=code,
                description=description,
                id=message_id,
            ),
        )

    def ping(self):
        return self._write(messages.PingRequestMessage())

    def pong(self):
        return self._write(messages.PingResponseMessage())


class StreamConnection(TornadoConnection):
    """Streaming request/response into protocol messages and sent by tornado
    connection

    Here are public apis provided by StreamConnection:
    "post_response(response)"
        stream response object into wire

    "stream_request(request)"
        stream request object into wire without waiting for a response

    "send_request(request)"
        stream request object into wire and wait for a response

    """

    @tornado.gen.coroutine
    def _stream(self, context, message_factory):
        """write request/response into frames

        Transform request/response into protocol level message objects based on
        types and argstreams.

        Assumption: the chunk data read from stream can fit into memory.

        If arg stream is at init or streaming state, build the message based on
        current chunk. If arg stream is at completed state, put current chunk
        into args[] array, and continue to read next arg stream in order to
        compose a larger message instead of sending multi small messages.

        Note: the message built at this stage is not guaranteed the size is
        less then 64KB.

        Possible messages created sequence:

        Take request as an example::
        CallRequestMessage(flags=fragment)
            --> CallRequestContinueMessage(flags=fragment)
            ....
            --> CallRequestContinueMessage(flags=fragment)
                --> CallRequestMessage(flags=none)

        :param context: Request or Response object
        """
        args = []
        try:
            for argstream in context.argstreams:
                chunk = yield argstream.read()
                args.append(chunk)
                chunk = yield argstream.read()
                while chunk:
                    message = (message_factory.
                               build_raw_message(context, args))
                    yield self.write(message)
                    args = [chunk]
                    chunk = yield argstream.read()

            # last piece of request/response.
            message = (message_factory.
                       build_raw_message(context, args, is_completed=True))
            yield self.write(message)
            context.state = StreamState.completed
        # Stop streamming immediately if exception occurs on the handler side
        except TChannelError as e:
            # raise by tchannel intentionally
            log.info("Stop Outgoing Streams because of error: %s", e.message)
            pass

    @tornado.gen.coroutine
    def post_response(self, response):
        try:
            # TODO: before_send_response
            yield self._stream(response, self.response_message_factory)

            # event: send_response
            self.tchannel.event_emitter.fire(
                EventType.after_send_response,
                response,
            )
        finally:
            response.close_argstreams(force=True)

    @tornado.gen.coroutine
    def stream_request(self, request):
        """send the given request and response is not required"""

        # event: send_request
        self.tchannel.event_emitter.fire(
            EventType.before_send_request,
            request,
        )

        try:
            request.close_argstreams()
            yield self._stream(request, self.request_message_factory)
            # TODO: add after_send_request callback
        finally:
            request.close_argstreams(force=True)

    def send_request(self, request):
        """Send the given request and response is required.

        Use this for messages which have a response message.

        :param request:
            request to send
        :returns:
            A Future containing the response for the request
        """
        assert not self.closed
        assert self._loop_running, "Perform a handshake first."

        request.id = request.id or self.next_message_id()
        assert request.id not in self._outstanding, (
            "Message ID '%d' already being used" % request.id
        )

        future = tornado.gen.Future()
        self._outstanding[request.id] = future
        self.stream_request(request)

        # the actual future that caller will yield
        response_future = tornado.gen.Future()
        # TODO: fire before_receive_response

        tornado.ioloop.IOLoop.current().add_future(
            future,
            lambda f: self.adapt_result(f, request, response_future),
        )
        return response_future

    def adapt_result(self, f, request, response_future):
        if f.exception():
            protocol_exception = f.exception()
            protocol_exception.tracing = request.tracing
            response_future.set_exception(protocol_exception)
            # event: after_receive_protocol_error
            self.tchannel.event_emitter.fire(
                EventType.after_receive_error,
                protocol_exception,
            )
        else:
            response = f.result()
            response.tracing = request.tracing
            response_future.set_result(response)
            # event: after_receive_response
            self.tchannel.event_emitter.fire(
                EventType.after_receive_response,
                response,
            )
