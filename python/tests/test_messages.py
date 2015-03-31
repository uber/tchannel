# Copyright (c) 2015 Uber Technologies, Inc.
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in
# all copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
# THE SOFTWARE.

from __future__ import absolute_import

import struct
import pytest

from tchannel import messages
from tchannel.messages.common import PROTOCOL_VERSION
from tchannel.io import BytesIO
from tchannel.messages import CallRequestMessage
from tchannel.tornado.message_factory import MessageFactory
from tests.util import big_arg


def make_short_bytes(value):
    """Convert value into a big-endian unsigned int."""
    return struct.pack('>H', value)


@pytest.fixture
def init_request_message():
    return BytesIO(
        make_short_bytes(0x02) +  # version 2
        make_short_bytes(0)  # 0 headers
    )


@pytest.fixture
def call_request_bytes():
    return bytearray([
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
    return BytesIO(
        make_short_bytes(PROTOCOL_VERSION) +
        make_short_bytes(1) +
        header_buffer
    )


def test_message_type_applies():
    """Verify message_type propagates."""
    assert messages.InitRequestMessage().message_type > 0


def test_init_request(init_request_message):
    """Verify we can get an init request message to parse."""
    message = messages.init_req_rw.read(init_request_message)
    assert message.version == 2
    assert message.headers == {}


def test_init_request_with_headers(init_request_with_headers):
    message = messages.init_req_rw.read(init_request_with_headers)
    assert message.version == 2
    assert message.headers['test_header'] == 'something'


def test_valid_ping_request():
    """Verify we don't barf on 0-length bodies."""
    assert (
        messages.ping_req_rw.read(BytesIO()) == messages.PingRequestMessage()
    )


@pytest.mark.parametrize('message_class, message_rw, attrs', [
    (messages.InitRequestMessage, messages.init_req_rw, {
        'headers': {'one': '2'}
    }),
    (messages.InitResponseMessage, messages.init_res_rw, {'headers': {}}),
    (messages.PingRequestMessage, messages.ping_req_rw, {}),
    (messages.PingResponseMessage, messages.ping_res_rw, {}),
    (messages.ErrorMessage, messages.error_rw, {
        'code': 1,
        'message': 'hi',
    }),
    (messages.CallRequestMessage, messages.call_req_rw, {
        'flags': 0,
        'ttl': 1,
        'tracing': messages.Tracing(0, 0, 0, 0),
        'service': 'kodenom',
        'headers': {},
        'checksum': (messages.ChecksumType.none, None),
        'args': None,
    }),
    (messages.CallRequestMessage, messages.call_req_rw, {
        'flags': 0x01,
        'ttl': 1,
        'tracing': messages.Tracing(0, 0, 0, 1),
        'service': 'with_checksum',
        'headers': {},
        'checksum': (messages.ChecksumType.crc32, 3),
        'args': [b'hi', b'\x00', ""],
    }),
    (messages.CallResponseMessage, messages.call_res_rw, {
        'flags': 1,
        'code': 1,
        'tracing': messages.Tracing(0, 0, 0, 1),
        'headers': {},
        'checksum': (messages.ChecksumType.crc32, 1),
        'args': None,
    }),
])
def test_roundtrip_message(message_class, message_rw, attrs):
    """Verify all message types serialize and deserialize properly."""
    message = message_class(**attrs)
    buff = message_rw.write(message, BytesIO()).getvalue()
    assert message == message_rw.read(BytesIO(buff))


@pytest.mark.parametrize('message_rw, byte_stream', [
    (messages.error_rw, bytearray(
        [1] + [0] * 25 + [0, 2] + list('hi')))
])
def test_parse_message(message_rw, byte_stream):
    """Verify all messages parse properly."""
    error = message_rw.read(BytesIO(byte_stream))
    assert error.code == 1
    assert error.message == u'hi'


def test_error_message_name():
    """Smoke test the error dictionary."""
    error = messages.ErrorMessage()
    error.code = 0x03
    assert error.error_name() == 'busy'


def test_call_req_parse(call_request_bytes):
    msg = messages.call_req_rw.read(BytesIO(call_request_bytes))

    assert msg.flags == 0
    assert msg.ttl == 1024

    assert msg.tracing == messages.Tracing(
        span_id=283686952306183,
        parent_id=579005069656919567,
        trace_id=1157726452361532951,
        traceflags=1
    )

    assert msg.service == 'apache'
    assert msg.headers == {'key': 'val'}
    assert msg.checksum == (messages.ChecksumType.none, None)

    assert msg.args == [b'on', b'to', b'te']


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

    msg = messages.call_res_rw.read(BytesIO(buff))

    assert msg.flags == 0
    assert msg.code == 0

    assert msg.tracing == messages.Tracing(
        span_id=283686952306183,
        parent_id=579005069656919567,
        trace_id=1157726452361532951,
        traceflags=1
    )

    assert msg.headers == {'key': 'val'}
    assert msg.checksum == (messages.ChecksumType.none, None)

    assert msg.args == [b'on', b'to', b'te']


def test_equality_check_against_none(init_request_with_headers):
    assert messages.InitRequestMessage().__eq__(None) is False


# TODO test case will fail due to StreamClosedError when
# increase the LARGE_AMOUNT to even bigger
@pytest.mark.gen_test
@pytest.mark.parametrize('arg2, arg3', [
    ("", big_arg()),
    (big_arg(), ""),
    ("test", big_arg()),
    (big_arg(),  "test"),
    (big_arg(), big_arg()),
    ("", ""),
    ("test", "test"),
])
def test_message_fragment(arg2, arg3):
    msg = CallRequestMessage(args=["", arg2, arg3])
    origin_msg = CallRequestMessage(args=["", arg2, arg3])
    message_factory = MessageFactory()
    fragments = message_factory.fragment(msg)
    recv_msg = None
    for fragment in fragments:
        recv_msg = message_factory.build(0, fragment)

    assert origin_msg.args == recv_msg.args
