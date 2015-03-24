from __future__ import absolute_import
import pytest

from tchannel import frame
from tchannel.frame_reader import FrameReader
from tchannel import messages
from tchannel.messages import CallRequestMessage, ChecksumType
from tchannel.io import BytesIO
from tchannel.messages.common import generate_checksum, verify_checksum


@pytest.mark.parametrize('checksum_type, seed', [
    (ChecksumType.none, 0),
    (ChecksumType.crc32, 0x0812fa3f),
])
def test_checksum(checksum_type, seed):
    message = CallRequestMessage()
    message.checksum = (checksum_type, seed)
    generate_checksum(message)
    message_id = 32
    payload = messages.RW[message.message_type].write(
        message, BytesIO()
    ).getvalue()

    f = frame.Frame(
        header=frame.FrameHeader(
            message_type=message.message_type,
            message_id=message_id,
        ),
        payload=payload
    )

    inframe = frame.frame_rw.write(f, BytesIO()).getvalue()
    reader = FrameReader(BytesIO(inframe))
    msg = reader.read().next().message
    assert verify_checksum(msg)
