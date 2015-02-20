from __future__ import absolute_import

from .exceptions import ProtocolException
from .io import BytesIO
from .mapping import get_message_class
from .parser import read_number
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

    def __init__(self, message, message_id):
        self._message = message
        self._message_id = message_id

    @classmethod
    def decode(cls, data):
        """Decode a sequence of bytes into a frame and message."""
        stream = BytesIO(data)
        if len(data) < cls.PRELUDE_SIZE:
            raise ProtocolException('Illegal frame length: %d' % len(data))

        message_length = read_number(stream, cls.SIZE_WIDTH)
        message_id = read_number(stream, cls.ID_WIDTH)
        message_type = read_number(stream, cls.TYPE_WIDTH)
        message_class = get_message_class(message_type)
        if not message_class:
            raise ProtocolException('Unknown message type: %d' % message_type)

        flags = read_number(stream, cls.FLAGS_WIDTH)
        if flags:
            # TODO handle partial messages (e.g. multiple frames)
            pass

        stream.read(cls.RESERVED_WIDTH)
        message = message_class()
        message.parse(stream, message_length - cls.PRELUDE_SIZE)
        frame = cls(message=message, message_id=message_id)

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
