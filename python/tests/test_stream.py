from __future__ import absolute_import

import pytest
import os
from tchannel.exceptions import StreamingException
from tchannel.tornado.stream import InMemStream, PipeStream


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
    with pytest.raises(StreamingException):
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
    with pytest.raises(StreamingException):
        yield stream.write("4")
