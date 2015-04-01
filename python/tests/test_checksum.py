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
