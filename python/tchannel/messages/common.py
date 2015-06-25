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

import zlib
from collections import namedtuple

import crcmod.predefined

from .. import rw
from ..enum import enum
from ..errors import InvalidChecksumError
from .types import Types

PROTOCOL_VERSION = 0x02


# 64KB Max frame size
# 16B (size:2 | type:1 | reserved:1 | id:4 | reserved:8)
# 1 2 Bytes can represent 0~2**16-1
MAX_PAYLOAD_SIZE = 0xFFEF   # 64*1024 - 16 - 1


StreamState = enum(
    'StreamState',
    init=0x00,
    streaming=0x01,
    completed=0x02,
    none=0x03,
)


FlagsType = enum(
    'FlagsType',
    none=0x00,
    fragment=0x01,
)


Tracing = namedtuple('Tracing', 'span_id parent_id trace_id traceflags')

tracing_rw = rw.instance(
    Tracing,
    ("span_id", rw.number(8)),      # span_id:8
    ("parent_id", rw.number(8)),    # parent_id:8
    ("trace_id", rw.number(8)),     # trace_id:8
    ("traceflags", rw.number(1)),   # traceflags:1
)


ChecksumType = enum(
    'ChecksumType',
    none=0x00,
    crc32=0x01,
    farm32=0x02,
    crc32c=0x03,
)


checksum_rw = rw.switch(
    rw.number(1),   # csumtype:1
    {
        ChecksumType.none: rw.none(),
        ChecksumType.crc32: rw.number(4),   # csum:4
        ChecksumType.farm32: rw.number(4),  # csum:4
        ChecksumType.crc32c: rw.number(4),  # csum:4
    }
)


CHECKSUM_MSG_TYPES = [Types.CALL_REQ,
                      Types.CALL_REQ_CONTINUE,
                      Types.CALL_RES,
                      Types.CALL_RES_CONTINUE]

# generate crc32c func at import time
crc32c = crcmod.predefined.mkCrcFun('crc-32c')


def compute_checksum(checksum_type, args, csum=0):
    if csum is None:
        csum = 0

    if checksum_type == ChecksumType.none:
        return None
    elif checksum_type == ChecksumType.crc32:
        for arg in args:
            csum = zlib.crc32(arg, csum) & 0xffffffff
    # TODO figure out farm32 cross platform issue
    elif checksum_type == ChecksumType.farm32:
        raise NotImplementedError()
    elif checksum_type == ChecksumType.crc32c:
        for arg in args:
            csum = crc32c(arg, csum)
    else:
        raise InvalidChecksumError()

    return csum


def generate_checksum(message, previous_csum=0):
    """Generate checksum for messages with
        CALL_REQ, CALL_REQ_CONTINUE,
        CALL_RES,CALL_RES_CONTINUE types.

    :param message: outgoing message
    :param previous_csum: accumulated checksum value
    """
    if message.message_type in CHECKSUM_MSG_TYPES:
        csum = compute_checksum(
            message.checksum[0],
            message.args,
            previous_csum,
        )

        message.checksum = (message.checksum[0], csum)


def verify_checksum(message, previous_csum=0):
    """Verify checksum for incoming message.

    :param message: incoming message
    :param previous_csum: accumulated checksum value

    :return return True if message checksum type is None
    or checksum is correct
    """
    if message.message_type in CHECKSUM_MSG_TYPES:
        csum = compute_checksum(
            message.checksum[0],
            message.args,
            previous_csum,
        )

        if csum == message.checksum[1]:
            return True
        else:
            return False
    else:
        return True
