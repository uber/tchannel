from __future__ import absolute_import

from .exceptions import ProtocolException
from .frame import Frame
from .io import BytesIO
from .parser import read_number_string


class FrameReader(object):
    """Read bytes from a stream and yield messages as they come.

    This takes a ``connection`` object which is anything that supports
    ``read(num_bytes)`` and ``write(bytes_)``.

    As you iterate over the ``read()`` call, you will get back subclasses of
    :class:`tchannel.messages.base.BaseMessage` along with their frames.
    """

    def __init__(self, connection):
        self.connection = connection

    def read(self):
        """Continually read from a stream until it runs dry.

        This usually occurs when the other end of the connection closes.
        """
        while True:
            size_bytes = self.connection.read(Frame.SIZE_WIDTH)
            # Read will return zero bytes when the other side of the connection
            # closes.
            if not size_bytes:
                break

            message_length = read_number_string(size_bytes, Frame.SIZE_WIDTH)

            chunk = self.connection.read(message_length - Frame.SIZE_WIDTH)
            if not chunk:
                raise ProtocolException(
                    'Expected %d bytes available, got none' % message_length
                )

            if len(chunk) != message_length - Frame.SIZE_WIDTH:
                raise ProtocolException(
                    'Expected %d bytes, got %d' %
                    (len(chunk), message_length - Frame.SIZE_WIDTH)
                )

            yield Frame.decode(BytesIO(chunk), message_length)
