from __future__ import absolute_import

from collections import namedtuple
from enum import IntEnum

from .. import rw

PROTOCOL_VERSION = 0x02


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

checksum_rw = rw.switch(
    rw.number(1),   # csumtype:1
    {
        ChecksumType.none: rw.none(),
        ChecksumType.crc32: rw.number(4),   # csum:4
        ChecksumType.farm32: rw.number(4),  # csum:4
    }
)
