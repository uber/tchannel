from __future__ import absolute_import
import functools

from .frame import Frame
from . import messages
from .exceptions import InvalidMessageException
from .messages.common import PROTOCOL_VERSION
from .messages.types import Types


class Connection(object):
    """Encapsulate transporting TChannel over an underlying stream."""
    def __init__(self, connection):
        """Initialize a TChannel connection with an underlying transport.

        ``connection`` must support ``read(num_bytes)`` and ``write(bytes_)``.
        """
        self._connection = connection
        self._id_sequence = 0

    def handle_calls(self, handler):
        """Dispatch calls to handler from the wire.

        When a new message is received, we will call ``handler(data,
        connection)`` where ``connection`` is a reference to the current
        ``Connection`` object (e.g. ``self``).
        """
        raise NotImplementedError()

    def await(self, callback):
        """Decode a full message off the wire."""
        raise NotImplementedError()

    def next_message_id(self):
        """Generate a new message ID."""
        self._id_sequence += 1
        return self._id_sequence

    def frame_and_write(self, message, callback=None):
        """Frame and write a message over a connection."""
        frame = Frame(
            message=message,
            message_id=self.next_message_id(),
        )
        return frame.write(self._connection, callback=callback)

    def ping(self):
        """Send a PING_REQ message to the remote end of the connection."""
        message = messages.PingRequestMessage()
        return self.frame_and_write(message)

    def pong(self):
        """Reply to a PING_REQ message with a PING_RES."""
        message = messages.PingResponseMessage()
        return self.frame_and_write(message)

    def wrap(self, callback):
        if callback:
            return functools.partial(callback, connection=self)

    def await_handshake(self, headers, callback=None):
        """Negotiate a common protocol version with a client."""
        self.handshake_callback = self.wrap(callback)
        self.handshake_headers = headers
        return self.await(callback=self.on_handshake)

    def extract_handshake_headers(self, message):
        """Extract TChannel headers from a handshake."""
        try:
            self.remote_host = message.headers[message.HOST_PORT]
            self.remote_process_name = message.headers[message.PROCESS_NAME]
        except KeyError as e:
            raise InvalidMessageException(
                'Missing required header: %s' % e
            )

        self.requested_version = message.version

    def on_handshake(self, data):
        frame, message = data
        if message.message_type != Types.INIT_REQ:
            raise InvalidMessageException(
                'You need to shake my hand first. Got: %d' %
                message.message_type,
            )

        self.extract_handshake_headers(message)

        response = messages.InitResponseMessage()
        response.version = PROTOCOL_VERSION
        response.headers = self.handshake_headers

        return self.frame_and_write(response, callback=self.handshake_callback)

    def initiate_handshake(self, headers, callback=None):
        """Send a handshake offer to a server."""
        message = messages.InitRequestMessage()
        message.version = PROTOCOL_VERSION
        message.headers = headers

        return self.frame_and_write(message, callback=callback)

    def await_handshake_reply(self, callback=None):
        self.handshake_reply_callback = callback
        return self.await(callback=self.on_handshake_reply)

    def on_handshake_reply(self, data):
        frame, message = data
        if message.message_type != Types.INIT_RES:
            raise InvalidMessageException(
                'Expected handshake response, got %d' %
                message.message_type,
            )

        self.extract_handshake_headers(message)
        if self.handshake_reply_callback:
            self.handshake_reply_callback(message)
