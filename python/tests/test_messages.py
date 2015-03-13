from __future__ import absolute_import
import struct

import pytest

from tchannel import exceptions
from tchannel import messages
from tchannel.messages.common import PROTOCOL_VERSION
from tchannel.io import BytesIO


def make_byte_stream(bytes_):
    return BytesIO(bytes_), len(bytes_)


def make_short_bytes(value):
    """Convert value into a big-endian unsigned int."""
    return struct.pack('>H', value)


@pytest.fixture
def init_request_message():
    return make_byte_stream(
        make_short_bytes(0x02) +  # version 2
        make_short_bytes(0)  # 0 headers
    )


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
        make_short_bytes(PROTOCOL_VERSION) +
        make_short_bytes(1) +
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
    (messages.InitResponseMessage, {
        'headers': {}
    }),
    (messages.PingRequestMessage, {}),
    (messages.PingResponseMessage, {}),
    (messages.ErrorMessage, {
        'code': 1,
        'message': 'hi',
        'original_message_id': 1,
    }),
    (messages.CallRequestMessage, {
        'flags': 0,
        'ttl': 1,
        'span_id': 0,
        'parent_id': 0,
        'trace_id': 0,
        'traceflags': 0,
        'service': 'kodenom',
        'headers': {},
        'checksum_type': 0,
        'arg_1': None,
        'arg_2': None,
        'arg_3': None,
    }),
    (messages.CallRequestMessage, {
        'flags': 0x01,
        'ttl': 1,
        'span_id': 0,
        'parent_id': 0,
        'trace_id': 0,
        'traceflags': 0x01,
        'service': 'with_checksum',
        'headers': {},
        'checksum_type': 1,
        'checksum': 3,
        'arg_1': b'hi',
        'arg_2': b'\x00',
        'arg_3': None,
    }),
    (messages.CallResponseMessage, {
        'flags': 1,
        'code': 1,
        'span_id': 1,
        'parent_id': 2,
        'trace_id': 3,
        'traceflags': 4,
        'headers': {},
        'checksum_type': 0x01,
        'checksum': 1,
        'arg_1': None,
        'arg_2': None,
        'arg_3': None,
    }),
])
def test_roundtrip_message(message_class, attrs):
    """Verify all message types serialize and deserialize properly."""
    message = message_class()
    for key, value in attrs.items():
        setattr(message, key, value)

    out = bytearray()
    message.serialize(out)

    in_message = message_class()
    in_message.parse(BytesIO(out), len(out))

    for key, value in attrs.items():
        assert getattr(in_message, key) == value


@pytest.mark.parametrize('message_class,byte_stream', [
    (messages.ErrorMessage, b'\x00\x00\x00\x00\x01\x00\x02hi')
])
def test_parse_message(message_class, byte_stream):
    """Verify all messages parse properly."""
    message = message_class()
    message.parse(BytesIO(byte_stream), len(byte_stream))


def test_error_message_name():
    """Smoke test the error dictionary."""
    error = messages.ErrorMessage()
    error.code = 0x03
    assert error.error_name() == 'busy'


def test_call_req_parse():
    buff = bytearray([
        0x00,                    # flags:1
        0x00, 0x00, 0x04, 0x00,  # ttl:4

        # tracing:24
        0x00, 0x01, 0x02, 0x03,  # span_id:8
        0x04, 0x05, 0x06, 0x07,  #
        0x08, 0x09, 0x0a, 0x0b,  # parent_id:8
        0x0c, 0x0d, 0x0e, 0x0f,  #
        0x10, 0x11, 0x12, 0x13,  # trace_id:8
        0x14, 0x15, 0x16, 0x17,  #
        0x01,                    # traceflags:1

        0x06,                    # service~1
        0x61, 0x70, 0x61, 0x63,  # ...
        0x68, 0x65,              # ...
        0x01,                    # nh:1
        0x03, 0x6b, 0x65, 0x79,  # (hk~1 hv~1){nh}
        0x03, 0x76, 0x61, 0x6c,  # ...
        0x00,                    # csumtype:1 (csum:4){0,1}
        0x00, 0x02, 0x6f, 0x6e,  # arg1~2
        0x00, 0x02, 0x74, 0x6f,  # arg2~2
        0x00, 0x02, 0x74, 0x65   # arg3~2
    ])

    msg = messages.CallRequestMessage()
    msg.parse(BytesIO(buff), len(buff))

    assert msg.flags == 0
    assert msg.ttl == 1024

    assert msg.span_id == 283686952306183
    assert msg.parent_id == 579005069656919567
    assert msg.trace_id == 1157726452361532951
    assert msg.traceflags == 1

    assert msg.service == 'apache'
    assert msg.headers == {'key': 'val'}
    assert msg.checksum_type == 0

    assert msg.arg_1 == b'on'
    assert msg.arg_2 == b'to'
    assert msg.arg_3 == b'te'


def test_call_res_parse():
    buff = bytearray([
        0x00,                    # flags:1
        0x00,                    # code:1

        # tracing:24
        0x00, 0x01, 0x02, 0x03,  # span_id:8
        0x04, 0x05, 0x06, 0x07,  #
        0x08, 0x09, 0x0a, 0x0b,  # parent_id:8
        0x0c, 0x0d, 0x0e, 0x0f,  #
        0x10, 0x11, 0x12, 0x13,  # trace_id:8
        0x14, 0x15, 0x16, 0x17,  #
        0x01,                    # traceflags:1

        0x01,                    # nh:1
        0x03, 0x6b, 0x65, 0x79,  # (hk~1 hv~1){nh}
        0x03, 0x76, 0x61, 0x6c,  # ...
        0x00,                    # csumtype:1 (csum:4){0,1}
        0x00, 0x02, 0x6f, 0x6e,  # arg1~2
        0x00, 0x02, 0x74, 0x6f,  # arg2~2
        0x00, 0x02, 0x74, 0x65   # arg3~2
    ])

    msg = messages.CallResponseMessage()
    msg.parse(BytesIO(buff), len(buff))

    assert msg.flags == 0
    assert msg.code == 0

    assert msg.span_id == 283686952306183
    assert msg.parent_id == 579005069656919567
    assert msg.trace_id == 1157726452361532951
    assert msg.traceflags == 1

    assert msg.headers == {'key': 'val'}
    assert msg.checksum_type == 0

    assert msg.arg_1 == b'on'
    assert msg.arg_2 == b'to'
    assert msg.arg_3 == b'te'
