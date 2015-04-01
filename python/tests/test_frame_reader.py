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

import pytest

from tchannel import exceptions
from tchannel.messages.base import BaseMessage
from tchannel.frame_reader import FrameReader, FrameWriter
from tchannel.io import BytesIO


@pytest.fixture
def ping_request():
    return bytearray([0, 16, 0xd0] + [0] * 13)


def test_read_empty_buffer():
    """Empty streams must result in no messages."""

    reader = FrameReader(BytesIO())
    messages = [message for message in reader.read()]
    assert not messages


def test_read_invalid_size():
    """ProtocolException must be raised if the stream runs short"""

    dummy_frame = bytearray([0, 20] + [0] * 14)
    reader = FrameReader(BytesIO(dummy_frame))

    with pytest.raises(exceptions.ProtocolException):
        next(reader.read())


@pytest.mark.parametrize('n', [
    3,
    10,
    100,
])
def test_read_multi_messages_one_chunk(ping_request, n):
    """Verify we read as many messages are in the chunk."""
    chunk = ping_request * n
    reader = FrameReader(BytesIO(chunk))
    messages = [message for message in reader.read()]
    assert len(messages) == n


def test_invalid_message_type():
    reader = FrameReader(BytesIO(bytearray(
        [0, 16, 42, 0, 1, 2, 3, 4] + [0] * 8
    )))

    with pytest.raises(exceptions.ProtocolException):
        next(reader.read())


def test_parse_error():
    reader = FrameReader(BytesIO(bytearray(
        [0, 16, 1, 0, 1, 2, 3, 4] + [0] * 8 + list("not a valid init request")
    )))

    with pytest.raises(exceptions.ProtocolException):
        next(reader.read())


def test_write_invalid_message_type():
    SomeRequest = type('SomeRequest', (BaseMessage,), {'message_type': 42})
    some_request = SomeRequest()

    with pytest.raises(exceptions.ProtocolException):
        FrameWriter(BytesIO()).write(1234, some_request)
