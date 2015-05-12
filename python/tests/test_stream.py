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

import os

import pytest

from tchannel.errors import StreamingError
from tchannel.errors import TChannelError
from tchannel.tornado.data import Response
from tchannel.tornado.stream import InMemStream
from tchannel.tornado.stream import PipeStream


@pytest.mark.gen_test
def test_InMemStream():
    stream = InMemStream()
    yield stream.write("1")
    yield stream.write("2")
    buf = yield stream.read()
    assert buf == "12"

    yield stream.write("3")
    buf = yield stream.read()
    assert buf == "3"

    # check internal stream buffer.
    assert len(stream._stream) == 0

    stream.close()
    with pytest.raises(StreamingError):
        yield stream.write("4")


@pytest.mark.gen_test
def test_PipeStream():
    r, w = os.pipe()
    stream = PipeStream(r, w, auto_close=True)
    yield stream.write("1")
    yield stream.write("2")
    buf = yield stream.read()
    assert buf == "12"

    yield stream.write("3")
    buf = yield stream.read()
    assert buf == "3"

    stream.close()
    with pytest.raises(StreamingError):
        yield stream.write("4")


@pytest.mark.gen_test
def test_response_exception():
    resp = Response()
    yield resp.write_body("aaa")

    with pytest.raises(StreamingError):
        yield resp.write_header("aaa")

    resp.flush()
    with pytest.raises(TChannelError):
        yield resp.write_body("aaaa")


@pytest.mark.gen_test
def test_error_during_stream(io_loop):
    stream = InMemStream()
    try:
        1 / 0
    except Exception as e:
        stream.set_exception(e)

    with pytest.raises(ZeroDivisionError):
        yield stream.read()

    with pytest.raises(ZeroDivisionError):
        yield stream.write("a")
