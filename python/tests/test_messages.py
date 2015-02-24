from __future__ import absolute_import
import struct

import pytest

from tchannel import exceptions
from tchannel import messages
from tchannel.io import BytesIO


def make_byte_stream(bytes_):
    return BytesIO(bytes_), len(bytes_)


def make_short_bytes(value):
    """Convert value into a big-endian unsigned int."""
    return struct.pack('>H', value)


@pytest.fixture
def init_request_message():
    return make_byte_stream(make_short_bytes(0x02))


@pytest.fixture
def init_request_with_headers():
    header_name = b'test_header'
    header_value = b'something'
    header_buffer = (
        make_short_bytes(len(header_name)) +
        header_name +
        make_short_bytes(len(header_value)) +
        header_value
    )
    return make_byte_stream(
        make_short_bytes(messages.PROTOCOL_VERSION) +
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
        message.parse(BytesIO(), 1)


def test_valid_ping_request():
    """Verify we don't barf on 0-length bodies."""
    message = messages.PingRequestMessage()
    message.parse(BytesIO(), 0)


@pytest.mark.parametrize('message_class,attrs', [
    (messages.InitRequestMessage, {
        'headers': {'one': '2'}
    }),
    (messages.PingRequestMessage, {}),
    (messages.PingResponseMessage, {}),
    (messages.ErrorMessage, {
        'code': 1,
        'message': 'hi',
        'original_message_id': 1
    }),
])
def test_serialize_message(message_class, attrs):
    """Verify all message types serialize properly."""
    message = message_class()
    out = bytearray()
    for key, value in attrs.items():
        setattr(message, key, value)

    message.serialize(out)


@pytest.mark.parametrize('message_class,byte_stream', [
    (messages.ErrorMessage, b'\x00\x00\x00\x00\x01\x00\x02hi')
])
def test_parse_message(message_class, byte_stream):
    """Verify all messages parse properly."""
    message = message_class()
    message.parse(BytesIO(byte_stream), len(byte_stream))
