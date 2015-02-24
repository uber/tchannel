from __future__ import absolute_import
import pytest

from tchannel import exceptions
from tchannel import messages
from tchannel.frame import Frame
from tchannel.io import BytesIO
from tchannel.parser import read_number
from tchannel.types import Types


class _FakeMessage(object):
    message_type = 0x30

    def serialize(self, out):
        """Serialize 0-bytes to ``out``."""
        return


@pytest.fixture
def dummy_frame():
    return bytearray([
        0, 0, 0, 16,  # Size
        0, 0, 0, 1,  # ID
        0,  # type
        0,  # flags
        0, 0, 0, 0, 0, 0,  # reserved padding
    ])


def test_empty_message(connection):
    """Verify size is set properly for an empty message."""
    message_id = 42
    frame = Frame(
        message=_FakeMessage(),
        message_id=message_id,
    )

    frame.write(connection)

    value = BytesIO(connection.getvalue())

    assert read_number(value, 4) == frame.PRELUDE_SIZE
    assert read_number(value, 4) == message_id
    assert read_number(value, 1) == 0x30


def test_decode_empty_buffer():
    """Verify we raise on invalid buffers."""
    with pytest.raises(exceptions.ProtocolException):
        Frame.decode(BytesIO(b'\x00\x00\x00\x00'))


def test_decode_with_message_length(dummy_frame):
    """Verify we can pre-flight a message size."""
    dummy_frame[8] = Types.PING_REQ
    Frame.decode(BytesIO(dummy_frame), len(dummy_frame))


def test_decode_invalid_message_id(dummy_frame):
    """Verify we raise on invalid message IDs."""
    dummy_frame[8] = 55  # not a real message type
    with pytest.raises(exceptions.ProtocolException):
        Frame.decode(BytesIO(dummy_frame))


def test_decode_ping(dummy_frame):
    """Verify we can decode a ping message."""
    dummy_frame[8] = Types.PING_REQ
    frame, message = Frame.decode(BytesIO(dummy_frame))


def test_decode_with_flags(dummy_frame):
    """Verify we handle the `partial` flag."""
    dummy_frame[8] = Types.PING_REQ
    dummy_frame[9] = 0x01

    frame, _ = Frame.decode(BytesIO(dummy_frame))
    assert frame.partial


def test_read_full_small_chunk(connection, dummy_frame):
    """Verify we can co-constitute from multiple reads."""
    frame = Frame(
        message=messages.PingRequestMessage(),
        message_id=42,
    )
    frame.write(connection)

    frame, message = Frame.read_full_message(BytesIO(connection.getvalue()), 4)
    assert message.message_type == Types.PING_REQ


def test_read_empty_buffer():
    """Verify we handle an empty buffer."""
    assert Frame.read_full_message(BytesIO(), 4) == (None, None)


def test_multi_frame(dummy_frame):
    dummy_frame[8] = Types.PING_REQ
    first_frame = bytearray(dummy_frame)
    second_frame = bytearray(dummy_frame)

    first_frame[9] = 0x01

    connection = BytesIO(first_frame + second_frame)
    frame, message = Frame.read_full_message(connection, 16)
