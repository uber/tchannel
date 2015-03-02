# coding: utf-8
from __future__ import absolute_import
import struct

import pytest

from tchannel.io import BytesIO
from tchannel.parser import read_number
from tchannel.parser import read_key_value
from tchannel.parser import write_number
from tchannel.parser import write_key_value


def test_read_char():
    """Ensure reading a single character works."""
    assert read_number(BytesIO(b'\x10'), 1) == 16


def test_read_long():
    """Ensure we can read 4-byte longs."""
    value = 12345
    assert read_number(BytesIO(
        struct.pack('>I', value)
    ), 4) == value


def test_read_invalid():
    """Ensure size validation is enforced."""
    with pytest.raises(ValueError):
        read_number(None, 42)


def test_read_zero_length_value():
    """Test edge case around 0-length value."""
    buff = BytesIO(
        b'\x00\x03key'
    )
    assert read_key_value(buff, 2, 0) == (
        'key',
        None,
        len('key') + 2
    )


def test_write_number():
    """Verify we pack structs properly."""
    assert write_number(0x01, 1) == b'\x01'


@pytest.mark.parametrize('key_size,value_size,value', [
    (2, None, 'value'),
    (2, 4, u"i'm a little snowman ☃"),
    (2, 2, None),
])
def test_write_key_value(key_size, value_size, value):
    """Verify we write variable-width values properly."""
    key = u'key ☢'

    stream = BytesIO(write_key_value(
        key, value, key_size=key_size, value_size=value_size
    ))

    utf8_key = key.encode('utf-8')
    key_length = len(utf8_key)
    assert read_number(stream, key_size) == key_length
    assert stream.read(key_length).decode('utf-8') == key

    value = value or ''
    utf8_value = value.encode('utf-8')
    value_length = len(utf8_value)
    assert read_number(stream, value_size or key_size) == value_length
    assert stream.read(value_length).decode('utf-8') == value
