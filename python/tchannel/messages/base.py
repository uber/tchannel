from __future__ import absolute_import

from ..parser import read_key_value
from ..parser import read_number
from ..parser import write_number
from ..parser import write_key_value


class BaseMessage(object):
    """Represent common functionality across all TChannel messages."""
    message_type = None
    message_id = None
    __slots__ = ()

    def __eq__(self, other):
        if other is None:
            return False
        return all(
            getattr(self, attr) == getattr(other, attr)
            for attr in self.__slots__
        )

    def parse(self, payload, size):
        """Parse a payload into a message.

        This is defined by bytes 16 and above of the message body, e.g. after
        the size and flags have been parsed.

        Payload may be ``None`` if size is 0.
        """
        raise NotImplementedError()

    def serialize(self, out):
        """Serialize a message to its wire format.

        ``out`` is generally a ``bytearray`` which is a mutable sequence of
        bytes.

        This generates the ``payload`` section of the message.
        """
        raise NotImplementedError()

    def _read_headers(self, stream, nh_size, header_size):
        """Read a variable number of headers.

        Returns a tuple of (headers dict, bytes read).
        """
        num_headers = read_number(stream, nh_size)
        bytes_read = nh_size

        headers = {}
        for _ in range(num_headers):
            header_name, header_value, num_bytes = read_key_value(
                stream,
                header_size
            )
            headers[header_name] = header_value
            bytes_read += num_bytes

        return headers, bytes_read

    def _write_headers(self, stream, headers, nh_size, header_size):
        """Write number of headers followed by headers.

        Format:
            nh~nh_size (hk~header_size hv~header_size){nh}
        """
        stream.extend(write_number(len(headers), nh_size))
        for key, value in headers.items():
            stream.extend(write_key_value(key, value, key_size=header_size))
