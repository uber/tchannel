from __future__ import absolute_import
from cStringIO import StringIO
import struct

import pytest

from tchannel.parser import read_big_endian


def test_read_char():
    """Ensure reading a single character works."""
    assert read_big_endian(StringIO(chr(0x10)), 1) == 16


def test_read_long():
    """Ensure we can read 4-byte longs."""
    value = 12345
    assert read_big_endian(StringIO(
        struct.pack('>I', value)
    ), 4) == value


def test_read_invalid():
    """Ensure size validation is enforced."""
    with pytest.raises(ValueError):
        read_big_endian(None, 42)
