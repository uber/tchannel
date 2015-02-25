from __future__ import absolute_import
import pytest

from tchannel import exceptions
from tchannel.io import BytesIO
from tchannel.stream_reader import StreamReader


@pytest.fixture
def ping_request():
    return b'\x00\x10\xd0' + b'\x00' * 13


def test_read_empty_buffer():
    """Verify we handle an empty buffer."""
    reader = StreamReader(BytesIO(), chunk_size=4)
    messages = [message for message in reader.read()]
    assert not messages


def test_read_invalid_size():
    """Verify we raise when we try to read but get nothing."""
    dummy_frame = b'\x00\x20' + b'\x00' * 14
    reader = StreamReader(BytesIO(dummy_frame), chunk_size=len(dummy_frame))

    with pytest.raises(exceptions.ProtocolException):
        next(reader.read())


def test_read_multi_chunk(ping_request):
    """Verify we read more from the stream when necessary."""
    reader = StreamReader(BytesIO(ping_request), chunk_size=4)
    next(reader.read())


@pytest.mark.parametrize('n', [
    3,
    10,
    100,
])
def test_read_multi_messages_one_chunk(ping_request, n):
    """Verify we read as many messages are in the chunk."""
    chunk = ping_request * n
    reader = StreamReader(BytesIO(chunk), chunk_size=len(chunk))
    messages = [message for message in reader.read()]
    assert len(messages) == n
