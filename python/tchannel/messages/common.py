from __future__ import absolute_import

import zlib

from collections import namedtuple
from enum import IntEnum

from .. import rw
from ..exceptions import InvalidChecksumException
from .types import Types

PROTOCOL_VERSION = 0x02
ENCODE_TYPE = 'utf-8'
DECODE_TYPE = 'utf-8'


class FlagsType(IntEnum):
    none = 0x00,
    fragment = 0x01

Tracing = namedtuple('Tracing', 'span_id parent_id trace_id traceflags')

tracing_rw = rw.instance(
    Tracing,
    ("span_id", rw.number(8)),      # span_id:8
    ("parent_id", rw.number(8)),    # parent_id:8
    ("trace_id", rw.number(8)),     # trace_id:8
    ("traceflags", rw.number(1)),   # traceflags:1
)


class ChecksumType(IntEnum):
    none = 0x00
    crc32 = 0x01
    farm32 = 0x02

    @staticmethod
    def standardize(checksum):
        return (ChecksumType(checksum[0]), checksum[1])


checksum_rw = rw.switch(
    rw.number(1),   # csumtype:1
    {
        ChecksumType.none: rw.none(),
        ChecksumType.crc32: rw.number(4),   # csum:4
        ChecksumType.farm32: rw.number(4),  # csum:4
    }
)


CHECKSUM_MSG_TYPES = [Types.CALL_REQ,
                      Types.CALL_REQ_CONTINUE,
                      Types.CALL_RES,
                      Types.CALL_RES_CONTINUE]


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
    else:
        raise InvalidChecksumException()

    return csum


def generate_checksum(message):
    """Generate checksum for messages with
        CALL_REQ, CALL_REQ_CONTINUE,
        CALL_RES,CALL_RES_CONTINUE types

    :param message: outgoing message
    """
    if message.message_type in CHECKSUM_MSG_TYPES:
        csum = compute_checksum(
            message.checksum[0],
            message.args)

        message.checksum = (message.checksum[0], csum)


def verify_checksum(message):
    """
    :return return True if message checksum type is None
    or checksum is correct
    """
    if message.message_type in CHECKSUM_MSG_TYPES:
        csum = compute_checksum(
            message.checksum[0],
            message.args)

        if csum == message.checksum[1]:
            return True
        else:
            return False
    else:
        return True


def encode_str(arg):
    if arg is not None:
        return arg.encode(DECODE_TYPE)
    else:
        return arg


def decode_str(arg):
    if arg is not None:
        return arg.decode(ENCODE_TYPE)
    else:
        return arg


def encode_pair(k, v):
    return (encode_str(k),
            encode_str(v))


def decode_pair(k, v):
    return (decode_str(k),
            decode_str(v))

