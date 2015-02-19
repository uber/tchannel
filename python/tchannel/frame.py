from __future__ import absolute_import

from .parser import write_number


class Frame(object):
    """Perform operations on a single TChannel frame."""

    SIZE_WIDTH = 4
    ID_WIDTH = 4
    TYPE_WIDTH = 1
    PRELUDE_SIZE = 0x10  # this many bytes of framing before payload
    RESERVED_PADDING = b'\x00\x00\x00\x00\x00\x00'  # 6 bytes are reserved

    def __init__(self, message, message_id):
        self._message = message
        self._message_id = message_id

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
