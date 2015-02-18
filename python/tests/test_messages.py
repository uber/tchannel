from __future__ import absolute_import
from cStringIO import StringIO
import struct

import pytest

from tchannel import messages
from tchannel import exceptions


def make_byte_stream(bytes_):
    return StringIO(bytes_), len(bytes_)


def make_short_bytes(value):
    """Convert value into a big-endian unsigned int."""
    return struct.pack('>H', value)


@pytest.fixture
def init_request_message():
    return make_byte_stream(make_short_bytes(0x02))


@pytest.fixture
def init_request_with_headers():
    header_name = 'test_header'
    header_value = 'something'
    header_buffer = (
        make_short_bytes(len(header_name)) +
        header_name +
        make_short_bytes(len(header_value)) +
        header_value
    )
    return make_byte_stream(
        make_short_bytes(0x02) +
        header_buffer
    )


def test_message_type_applies():
    """Verify message_type propagates."""
    assert messages.InitRequestMessage().message_type > 0


def test_init_request(init_request_message):
    """Verify we can get an init request message to parse."""
    message = messages.InitRequestMessage()
    message.parse(*init_request_message)

    assert message.version == 2


def test_init_request_with_headers(init_request_with_headers):
    message = messages.InitRequestMessage()
    message.parse(*init_request_with_headers)

    assert message.headers['test_header']


def test_invalid_ping_request():
    """Ensure we validate ping requests."""
    message = messages.PingRequestMessage()
    with pytest.raises(exceptions.InvalidMessageException):
        message.parse(StringIO(), 1)


def test_valid_ping_request():
    """Verify we don't barf on 0-length bodies."""
    message = messages.PingRequestMessage()
    message.parse(StringIO(), 0)
