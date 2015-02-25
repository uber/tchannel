from __future__ import absolute_import
import pytest

from tchannel import exceptions
from tchannel.frame_reader import FrameReader
from tchannel.io import BytesIO


@pytest.fixture
def ping_request():
    return b'\x00\x10\xd0' + b'\x00' * 13


def test_read_empty_buffer():
    """Verify we handle an empty buffer."""
    reader = FrameReader(BytesIO(), chunk_size=4)
    messages = [message for message in reader.read()]
    assert not messages


def test_read_invalid_size():
    """Verify we raise when we try to read but get nothing."""
    dummy_frame = b'\x00\x20' + b'\x00' * 14
    reader = FrameReader(BytesIO(dummy_frame), chunk_size=len(dummy_frame))

    with pytest.raises(exceptions.ProtocolException):
        next(reader.read())


def test_read_multi_chunk(ping_request):
    """Verify we read more from the stream when necessary."""
    reader = FrameReader(BytesIO(ping_request), chunk_size=4)
    next(reader.read())


def test_read_not_enough_data():
    """Verify we bail when not enough data is available."""
    bad_bytes = b'\x00\x03'
    reader = FrameReader(BytesIO(bad_bytes), len(bad_bytes))

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
    reader = FrameReader(BytesIO(chunk), chunk_size=len(chunk))
    messages = [message for message in reader.read()]
    assert len(messages) == n
