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

import random

import pytest

from tchannel.io import BytesIO
from tchannel.messages.common import ChecksumType
from tchannel.messages.common import Tracing
from tchannel.messages.common import checksum_rw
from tchannel.messages.common import tracing_rw


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
