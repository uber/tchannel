from __future__ import absolute_import

from . import messages
from .exceptions import InvalidMessageException
from .frame import Frame
from .messages.common import PROTOCOL_VERSION
from .messages.types import Types
from .stream_reader import StreamReader


class Connection(object):
    """Adapt a ``socket.socket`` connection as a TChannel connection.

    Use this class to perform synchronous socket operations, e.g. over TCP or a
    Unix Domain Socket.
    """
    INITIAL_CHUNK_SIZE = 4096

    def __init__(self, connection):
        self._connection = _SocketIOAdapter(connection)
        self._id_sequence = 0
        self._reader = StreamReader(
            self._connection,
            self.INITIAL_CHUNK_SIZE
        ).read()

    def frame_and_write(self, message):
        """Frame and write a message over a connection."""
        frame = Frame(
            message=message,
            message_id=self.next_message_id(),
        )
        return frame.write(self._connection)

    def next_message_id(self):
        """Return a new message ID."""
        self._id_sequence += 1
        return self._id_sequence

    def _await(self):
        """Decode a full message and return"""
        return next(self._reader)

    def await_handshake(self, headers):
        """Negotiate a common protocol version with a client."""
        frame, message = self._await()
        if message.message_type != Types.INIT_REQ:
            raise InvalidMessageException(
                'You need to shake my hand first. Got: %d' %
                message.message_type,
            )

        try:
            self._remote_host = message.headers[message.HOST_PORT]
            self._remote_process_name = message.headers[message.PROCESS_NAME]
        except KeyError as e:
            raise InvalidMessageException(
                'Missing required header: %s' % e
            )

        self._requested_version = message.version

        response = messages.InitResponseMessage()
        response.version = PROTOCOL_VERSION
        response.headers = headers

        return self.frame_and_write(response)

    def initiate_handshake(self, headers):
        """Send a handshake offer to a server."""
        message = messages.InitRequestMessage()
        message.version = PROTOCOL_VERSION
        message.headers = headers

        return self.frame_and_write(message)

    def handle_calls(self, handler):
        for frame, message in self._reader:
            handler(self._connection, frame, message)

    def ping(self):
        """Send a PING_REQ message to the remote end of the connection."""
        message = messages.PingRequestMessage()
        return self.frame_and_write(message)

    def pong(self):
        """Reply to a PING_REQ message with a PING_RES."""
        message = messages.PingResponseMessage()
        return self.frame_and_write(message)


class _SocketIOAdapter(object):
    """Represent a ``socket.socket`` instance as a buffer."""
    def __init__(self, connection):
        self._connection = connection

    def read(self, size):
        # TODO callback-ify?
        return self._connection.recv(size)

    def write(self, data):
        # TODO callback-ify?
        return self._connection.sendall(data)
