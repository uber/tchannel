from __future__ import absolute_import

from .exceptions import ProtocolException
from .frame import Frame
from .io import BytesIO
from .parser import read_number_string


class StreamReader(object):
    """Read bytes from a stream and yield messages as they come."""

    __slots__ = (
        '_connection',
        'chunk_size',
    )

    def __init__(self, connection, chunk_size):
        self._connection = connection
        self.chunk_size = chunk_size

    def read(self):
        """Continually read from a stream until it runs dry.

        This usually occurs when the other end of the connection closes.
        """
        while True:
            chunk = self._connection.read(self.chunk_size)
            if not chunk:
                break

            message_length = read_number_string(
                chunk[0:Frame.SIZE_WIDTH],
                Frame.SIZE_WIDTH,
            )

            if message_length > self.chunk_size:
                rest_of_message = self._connection.read(
                    message_length - self.chunk_size
                )
                if not rest_of_message:
                    raise ProtocolException('Unexpectedly empty stream')

                yield Frame.decode(BytesIO(chunk + rest_of_message))
            else:
                yield Frame.decode(BytesIO(chunk))
