from __future__ import absolute_import

from .frame_reader import FrameReader
from .connection import Connection


class _SocketIOAdapter(object):
    """Represent a ``socket.socket`` instance as a buffer."""
    def __init__(self, connection):
        self._connection = connection

    def read(self, size, callback=None):
        return self._connection.recv(size)

    def write(self, data, callback=None):
        return self._connection.sendall(data)


class SocketConnection(Connection):
    """Adapt a ``socket.socket`` connection as a TChannel connection.

    Use this class to perform synchronous socket operations, e.g. over TCP or a
    Unix Domain Socket.
    """
    ADAPTER = _SocketIOAdapter

    def __init__(self, connection):
        super(SocketConnection, self).__init__(connection)

        self.reader = FrameReader(
            self._connection,
        ).read()

    def handle_calls(self, handler):
        for frame, message in self.reader:
            handler(self, frame, message)
