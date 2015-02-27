from __future__ import absolute_import

from .frame_reader import IOStreamFrameReader
from ..connection import Connection


class _IOStreamAdapter(object):
    """Adapt a ``tornado.iostream.IOStream."""
    def __init__(self, stream):
        self._stream = stream

    def read(self, size, callback=None):
        """Read ``size`` bytes and run ``callback`` when ready.

        Unlike a normal ``socket.recv(size)`` call, this will wait to call
        ``callback`` until ``size`` bytes are available.

        Returns a future if no callback is given.
        """
        return self._stream.read_bytes(size, callback)

    def write(self, data, callback=None):
        """Write data asynchronously to the stream.

        Returns a future if no callback is given.
        """
        return self._stream.write(bytes(data), callback=callback)


class TornadoConnection(Connection):
    """Handle speaking TChannel over a Tornado connection."""
    ADAPTER = _IOStreamAdapter

    def __init__(self, connection):
        super(TornadoConnection, self).__init__(connection)
        self.reader = IOStreamFrameReader(
            self._connection,
        )
        connection.set_close_callback(self.on_close)
        self.closed = False

    def on_close(self):
        self.closed = True

    def await(self, callback):
        """Wait for the next message and call ``callback.``"""
        return self.reader.read(callback=callback)

    def handle_calls(self, handler):
        return self.await(callback=self.wrap(handler))
