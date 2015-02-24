from __future__ import absolute_import

from .exceptions import ProtocolException
from .io import BytesIO
from .mapping import get_message_class
from .parser import read_number
from .parser import read_number_string
from .parser import write_number


class Frame(object):
    """Perform operations on a single TChannel frame."""
    SIZE_WIDTH = 4
    ID_WIDTH = 4
    TYPE_WIDTH = 1
    FLAGS_WIDTH = 1
    PRELUDE_SIZE = 0x10  # this many bytes of framing before payload
    RESERVED_PADDING = b'\x00\x00\x00\x00\x00\x00'  # 6 bytes are reserved
    RESERVED_WIDTH = len(RESERVED_PADDING)

    MORE_FRAMES_FLAG = 0x01

    def __init__(self, message, message_id, partial=False):
        self._message = message
        self._message_id = message_id
        self.partial = partial

    @classmethod
    def decode(cls, stream, message_length=None, message=None):
        """Decode a sequence of bytes into a frame and message.

        :param stream: a byte stream
        :param message_length: length of the message in bytes including framing
        :param message: an existing message to read into, if the message spans
            multiple frames
        """
        if message_length is None:
            message_length = read_number(stream, cls.SIZE_WIDTH)
        else:
            stream.read(cls.SIZE_WIDTH)

        if message_length < cls.PRELUDE_SIZE:
            raise ProtocolException(
                'Illegal frame length: %d' % message_length
            )

        message_id = read_number(stream, cls.ID_WIDTH)
        message_type = read_number(stream, cls.TYPE_WIDTH)
        message_class = get_message_class(message_type)
        if not message_class:
            raise ProtocolException('Unknown message type: %d' % message_type)

        flags = read_number(stream, cls.FLAGS_WIDTH)
        partial = flags & cls.MORE_FRAMES_FLAG

        stream.read(cls.RESERVED_WIDTH)
        if not message:
            message = message_class()
        message.parse(stream, message_length - cls.PRELUDE_SIZE)
        frame = cls(message=message, message_id=message_id, partial=partial)

        return frame, message

    @classmethod
    def read_full_frame(cls, stream, chunk_size, message=None):
        """Read a full frame off the wire.

        :param stream: a byte stream
        :param chunk_size: number of bytes to read initially from ``stream``
        :param message: an existing message to read into, if the message spans
            multiple frames
        """
        chunk = stream.read(chunk_size)
        if not chunk:
            return None, None

        message_length = read_number_string(
            chunk[0:cls.SIZE_WIDTH],
            cls.SIZE_WIDTH,
        )[0]
        if message_length > chunk_size:
            rest_of_message = stream.read(message_length - chunk_size)
            if not rest_of_message:
                raise ProtocolException('Unexpectedly empty stream')
            full_message = BytesIO(chunk + rest_of_message)
        else:
            full_message = BytesIO(chunk)

        return cls.decode(full_message, message=message)

    @classmethod
    def read_full_message(cls, stream, chunk_size):
        """Read a full message off the wire.

        Possibly re-hydrating from multiple frames.

        :param stream: a byte stream
        :param chunk_size: number of bytes to read initially from ``stream``
        """
        frame, message = cls.read_full_frame(stream, chunk_size)
        if not frame:
            return None, None

        next_frame = frame
        while next_frame.partial:
            next_frame, message = cls.read_full_frame(
                stream,
                chunk_size,
                message=message,
            )

        return frame, message

    def write(self, connection):
        """Write a frame out to a connection."""
        payload = bytearray()
        self._message.serialize(payload)
        payload_length = len(payload)

        header_bytes = bytearray()

        header_bytes.extend(write_number(
            payload_length + self.PRELUDE_SIZE,
            self.SIZE_WIDTH
        ))

        header_bytes.extend(write_number(
            self._message_id,
            self.ID_WIDTH
        ))

        header_bytes.extend(write_number(
            self._message.message_type,
            self.TYPE_WIDTH
        ))

        # No flags
        header_bytes.append(0)

        # 6 bytes of reserved data
        header_bytes.extend(self.RESERVED_PADDING)

        # Then the payload
        header_bytes.extend(payload)
        connection.write(header_bytes)
