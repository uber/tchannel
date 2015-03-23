from __future__ import absolute_import

import functools
import logging
import os
import socket
import sys

from tornado import gen
from tornado import iostream

from .. import frame
from .. import messages
from .. import exceptions
from ..io import BytesIO
from ..context import Context
from ..messages import CallResponseMessage
from ..messages.types import Types
from ..messages.common import PROTOCOL_VERSION

from tornado.concurrent import Future

log = logging.getLogger('tchannel')


class TornadoConnection(object):
    """Handle speaking TChannel over a Tornado connection."""

    def __init__(self, connection):
        self.connection = connection
        self.closed = False
        self._id_sequence = 0
        self.remote_host = None
        self.remote_process_name = None
        self.requested_version = None
        self.awaiting_responses = {}

        self.response = CallResponseMessage()
        connection.set_close_callback(self.on_close)

    def next_message_id(self):
        self._id_sequence += 1
        return self._id_sequence

    def on_close(self):
        self.closed = True
        self.awaiting_responses = {}

    def extract_handshake_headers(self, message):
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

    def await(self):
        future = Future()

        def on_body(size, body):
            f = frame.frame_rw.read(BytesIO(body), size=size)
            message_rw = messages.RW[f.header.message_type]
            message = message_rw.read(BytesIO(f.payload))
            future.set_result(Context(f.header.message_id, message))

        def on_read_size(size_bytes):
            size = frame.frame_rw.size_rw.read(BytesIO(size_bytes))
            return self.connection.read_bytes(
                size - size_width,
                callback=(lambda body: on_body(size, body))
            )

        size_width = frame.frame_rw.size_rw.width()
        self.connection.read_bytes(size_width, callback=on_read_size)

        return future

    def frame_and_write(self, message, message_id=None):
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

    def handle_calls(self, handler):
        future = Future()

        def handle(f):
            handler(f.result(), self)
            future.set_result(None)

        self.await().add_done_callback(handle)
        return future

    def wrap(self, f):
        return functools.partial(f, connection=self)

    def close(self):
        return self.connection.close()

    def initiate_handshake(self, headers):
        message = messages.InitRequestMessage(
            version=PROTOCOL_VERSION,
            headers=headers
        )
        return self.frame_and_write(message)

    @gen.coroutine
    def await_handshake_reply(self):
        ctx = yield self.await()
        message = ctx.message

        if message.message_type != Types.INIT_RES:
            raise exceptions.InvalidMessageException(
                'Expected handshake response, got %d' %
                message.message_type,
            )

        self.extract_handshake_headers(message)

        raise gen.Return(message)

    @gen.coroutine
    def await_handshake(self, headers):
        ctx = yield self.await()
        message = ctx.message

        if message.message_type != Types.INIT_REQ:
            raise exceptions.InvalidMessageException(
                'You need to shake my hand first. Got: %d' %
                message.message_type,
            )

        self.extract_handshake_headers(message)

        response = messages.InitResponseMessage(PROTOCOL_VERSION, headers)
        yield self.frame_and_write(response, message_id=ctx.message_id)

        raise gen.Return(self)

    def ping(self, message_id=None):
        message = messages.PingRequestMessage()
        return self.frame_and_write(message, message_id=message_id)

    def pong(self, message_id=None):
        message = messages.PingResponseMessage()
        return self.frame_and_write(message, message_id=message_id)

    @classmethod
    @gen.coroutine
    def outgoing(cls, hostport, sock=None, process_name=None):
        host, port = hostport.rsplit(":", 1)

        sock = sock or socket.socket(socket.AF_INET, socket.SOCK_STREAM)

        # TODO: change this to tornado.tcpclient.TCPClient to do async DNS
        # lookups.
        stream = iostream.IOStream(sock)

        log.debug("connecting to hostport %s", hostport)

        yield stream.connect((host, int(port)))

        connection = cls(stream)

        log.debug("initiating handshake with %s", sock.getsockname())

        yield connection.initiate_handshake(headers={
            'host_port': '%s:%s' % sock.getsockname(),
            'process_name': (
                process_name or "%s[%s]" % (sys.argv[0], os.getpid())
            ),
        })

        log.debug("awaiting handshake reply")

        yield connection.await_handshake_reply()

        def handle_call_response(context, connection):
            if context is None:
                log.warn('done with connection :/')
                return connection.close()

            if context and context.message_id in connection.awaiting_responses:
                resp_future = connection.awaiting_responses.pop(
                    context.message_id,
                )
                resp_future.set_result(context)
            else:
                log.warn(
                    'unrecognized response for message %s',
                    getattr(context, 'message_id', None),
                )
            connection.handle_calls(handle_call_response)

        connection.handle_calls(handle_call_response)

        log.debug("completed handshake")

        raise gen.Return(connection)

    def write_headers(self, start_line, headers, chunk=None, callback=None):
        self.response.headers = headers or {'currently': 'broken'}

    def write(self, chunk, callback=None):
        self.response.arg_3 += chunk
        # TODO callback implementation

    def set_close_callback(self, callback):
        # TODO implement close callback
        pass

    def finish(self):
        """ write response """
        self.response.arg_1 = "response from inbound server"
        self.response.arg_2 = "inbound"
        self.frame_and_write(self.response)

        # reset response message
        self.response = CallResponseMessage()
        return
