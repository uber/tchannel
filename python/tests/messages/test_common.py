from __future__ import absolute_import

import pytest
import random

from tchannel.io import BytesIO
from tchannel.messages.common import checksum_rw, ChecksumType
from tchannel.messages.common import tracing_rw, Tracing


@pytest.mark.parametrize('typ, value', [
    (ChecksumType.none, None),
    (ChecksumType.crc32, 1234),
    (ChecksumType.farm32, 5678),
])
def test_chucksum_round_trip(typ, value):
    buff = checksum_rw.write((typ, value), BytesIO()).getvalue()
    assert (typ, value) == checksum_rw.read(BytesIO(buff))


@pytest.mark.parametrize('bs, typ, value', [
    ([0], ChecksumType.none, None),
    ([1, 1, 2, 3, 4], ChecksumType.crc32, 16909060),
    ([2, 1, 2, 3, 4], ChecksumType.farm32, 16909060),
])
def test_checksum_read(bs, typ, value):
    assert checksum_rw.read(BytesIO(bytearray(bs))) == (typ, value)


def test_tracing_round_trip():
    for i in xrange(100):
        t = Tracing(
            random.randint(0, 100000),
            random.randint(0, 100000),
            random.randint(0, 100000),
            random.randint(0, 1),
        )

        buff = tracing_rw.write(t, BytesIO()).getvalue()
        assert t == tracing_rw.read(BytesIO(buff))


@pytest.mark.parametrize('tracing, bs', [
    (Tracing(1, 2, 3, 0), [
        0, 0, 0, 0, 0, 0, 0, 1,  # span_id:8
        0, 0, 0, 0, 0, 0, 0, 2,  # parent_id:8
        0, 0, 0, 0, 0, 0, 0, 3,  # trace_id:8
        0,                       # traceflags:1
    ])
])
def test_tracing_read(tracing, bs):
    assert tracing_rw.read(BytesIO(bytearray(bs))) == tracing
