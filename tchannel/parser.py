from __future__ import absolute_import

import struct


def read_big_endian(buffer, size):
    """Read a big-endian number off the byte stream."""
    if size == 1:
        format = '>B'
    elif size == 2:
        format = '>H'
    elif size == 4:
        format = '>I'
    else:
        raise ValueError('size must be 1, 2, or 4')
    return struct.unpack(format, buffer.read(size))[0]


def read_short(buffer):
    """Read two bytes in big-endian and return an unsigned integer."""
    return read_big_endian(buffer, 2)


def read_variable_length_key(buffer, key_size):
    """Read a variable-length key from a stream.

    Returns total number of bytes read, plus the value.
    """
    key_bytes = read_big_endian(buffer, key_size)
    value = buffer.read(key_bytes)
    return value, (key_bytes + key_size)
