from __future__ import absolute_import

from .exceptions import ProtocolException
from .frame import Frame
from .io import BytesIO
from .parser import read_number
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

            message_length = _get_size(chunk)

            if message_length > self.chunk_size:
                rest_of_message = self._connection.read(
                    message_length - self.chunk_size
                )
                if not rest_of_message:
                    raise ProtocolException('Unexpectedly empty stream')

                yield Frame.decode(BytesIO(chunk + rest_of_message))

            elif len(chunk) > message_length:
                # We got a payload with multiple messages.
                stream = BytesIO(chunk)
                remaining_bytes = len(chunk)

                while remaining_bytes:
                    message_length = read_number(stream, Frame.SIZE_WIDTH)
                    yield Frame.decode(stream, message_length)
                    remaining_bytes -= message_length
            else:
                yield Frame.decode(BytesIO(chunk))


def _get_size(chunk):
    return read_number_string(chunk[0:Frame.SIZE_WIDTH], Frame.SIZE_WIDTH)
