from __future__ import absolute_import
import pytest

from tchannel.frame import FrameHeader
from tchannel.frame import Frame
from tchannel.frame import frame_rw
from tchannel.io import BytesIO
from tchannel.messages import PingRequestMessage
from tchannel.messages.types import Types


class _FakeMessage(object):
    message_type = 0x30

    def serialize(self, out):
        """Serialize 0-bytes to ``out``."""
        return


@pytest.fixture
def dummy_frame():
    return bytearray([
        0, 16,  # Size
        0,  # type
        0,  # reserved
        0, 0, 0, 1,  # ID
        0, 0, 0, 0, 0, 0, 0, 0  # reserved padding
    ])


def test_frame_header_width():
    assert frame_rw.width() == 16


def test_empty_payload(connection):
    """Verify size is set properly for an empty message."""

    message_id = 42

    frame = Frame(
        header=FrameHeader(
            message_id=message_id,
            message_type=0x30
        ),
        payload=""
    )

    frame_rw.write(frame, connection)
    assert connection.getvalue() == bytearray([
        0, 16,  # size:2
        0x30,   # type:1
        0,      # reserved:1
        0, 0, 0, 42,    # id:4
        0, 0, 0, 0, 0, 0, 0, 0  # padding:8
    ])


def test_decode_empty_buffer():
    """Verify we can parse zero size frame."""
    assert frame_rw.read(BytesIO(b'\x00\x00\x00\x00')) is None


def test_decode_with_message_length(dummy_frame):
    """Verify we can pre-flight a message size."""
    dummy_frame[2] = Types.PING_REQ
    frame_rw.read(
        BytesIO(dummy_frame[2:]), size=len(dummy_frame)
    ) == PingRequestMessage()
