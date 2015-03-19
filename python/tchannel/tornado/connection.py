from __future__ import absolute_import
import json
from tornado import stack_context

from .frame_reader import IOStreamFrameReader
from ..connection import Connection
from tchannel.messages import CallResponseMessage


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

    def __init__(self, connection):
        adapted = _IOStreamAdapter(connection)
        super(TornadoConnection, self).__init__(adapted)

        self.reader = IOStreamFrameReader(adapted)
        connection.set_close_callback(self.on_close)
        self.closed = False
        self.response = CallResponseMessage()
        self.response.arg_3 = []

    def on_close(self):
        self.closed = True

    def await(self, callback=None):
        """Wait for the next message and call ``callback.``"""
        callback = callback or (lambda context: None)
        return self.reader.read(callback=callback)

    def handle_calls(self, handler):
        return self.await(callback=self.wrap(handler))

    def close(self):
        return self._connection._stream.close()

    def set_close_callback(self, callback):
        """Call the given callback when the stream is closed.

        This is not necessary for applications that use the `.Future`
        interface; all outstanding ``Futures`` will resolve with a
        `StreamClosedError` when the stream is closed.
        """
        self._close_callback = stack_context.wrap(callback)

    def write_headers(self, start_line, headers, chunk=None, callback=None):
        raise NotImplementedError

    def write(self, chunk, callback=None):
        self.response.arg_3.extend(chunk)

    def finish(self):
        print "write response"
        self.response.flags = 0
        self.response.code = 200
        self.response.span_id = 0
        self.response.parent_id = 0
        self.response.trace_id = 0
        self.response.traceflags = 0
        self.response.headers = {'currently': 'broken'}
        self.response.checksum_type = 0
        self.response.checksum = 0
        self.response.arg_1 = "from in bound"
        self.response.arg_2 = "in bound"
        self.frame_and_write(self.response)

    def flush(self):
        self.finish()
