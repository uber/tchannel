from __future__ import absolute_import

from . import messages
from .frame import Frame


class Connection(object):
    """Adapt a ``socket.socket`` connection as a TChannel connection.

    Use this class to perform synchronous socket operations, e.g. over TCP or a
    Unix Domain Socket.
    """
    def __init__(self, connection):
        self._connection = _SocketIOAdapter(connection)
        self._id_sequence = 0

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

    def await_handshake(self):
        """Negotiate a common protocol version with a client."""
        hunk = self._connection.read(4096)
        # TODO
        hunk

    def initiate_handshake(self):
        """Send a handshake offer to a server."""
        message = messages.InitRequestMessage()
        message.version = messages.PROTOCOL_VERSION
        # TODO specify service name and host/port
        message.headers = {}

        return self.frame_and_write(message)

    def handle_calls(self, handler):
        # TODO
        raise NotImplementedError()

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
