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

import mock
import pytest

from thrift.Thrift import TType

from tchannel.tornado.stream import InMemStream
from tchannel.tornado.request import Request
from tchannel.tornado.response import Response
from tchannel.thrift.scheme import ThriftArgScheme
from tchannel.thrift.server import build_handler


class FakeException(Exception):

    thrift_spec = (
        None,
        (1, TType.STRING, 'message', None, None),
    )

    def __init__(self, message=None):
        self.message = message

    def write(self, proto):
        proto.writeStructBegin('FakeException')

        if self.message is not None:
            proto.writeFieldBegin('message', TType.STRING, 1)
            proto.writeString(self.message)
            proto.writeFieldEnd()

        proto.writeFieldStop()
        proto.writeStructEnd()


class FakeResult(object):

    thrift_spec = (
        (0, TType.STRING, 'success', None, None),
        (
            1, TType.STRUCT, 'someException',
            (FakeException, FakeException.thrift_spec),
            None,
        ),
    )

    def __init__(self, success=None, someException=None):
        self.success = success
        self.someException = someException

    def read(self, proto):
        pass  # don't care

    def write(self, proto):
        proto.writeStructBegin('FakeResult')

        if self.success is not None:
            proto.writeFieldBegin('success', TType.STRING, 0)
            proto.writeString(self.success)
            proto.writeFieldEnd()

        if self.someException is not None:
            proto.writeFieldBegin('someException', TType.STRUCT, 1)
            self.someException.write(proto)
            proto.writeFieldEnd()

        proto.writeFieldStop()
        proto.writeStructEnd()


@pytest.mark.gen_test
def test_build_handler():
    def call(treq, tres, tchan):
        return "world"

    response_body = mock.Mock(spec=InMemStream)

    req = Request(
        argstreams=[
            InMemStream('hello'),
            InMemStream('\00\00'),  # no headers
            InMemStream('\00'),  # empty struct
        ],
        scheme=ThriftArgScheme(FakeResult),
    )
    req.close_argstreams()

    res = Response(
        argstreams=[
            InMemStream(),
            InMemStream(),
            response_body,
        ],
        scheme=ThriftArgScheme(FakeResult),
    )
    tchannel = mock.Mock()

    handler = build_handler(FakeResult, call)
    yield handler(req, res, tchannel)

    response_body.write.assert_called_once_with(
        bytearray([
            0x0b,                    # field type = TType.STRING
            0x00, 0x00,              # field ID = 0
            0x00, 0x00, 0x00, 0x05,  # string length = 5
        ] + list("world") + [
            0x00,                    # end struct
        ])
    )
    assert 0 == res.status_code


@pytest.mark.gen_test
def test_build_handler_exception():
    def call(treq, tres, tchan):
        raise FakeException('fail')

    response_body = mock.Mock(spec=InMemStream)

    req = Request(
        argstreams=[
            InMemStream('hello'),
            InMemStream('\00\00'),  # no headers
            InMemStream('\00'),  # empty struct
        ],
        scheme=ThriftArgScheme(FakeResult),
    )
    req.close_argstreams()

    res = Response(
        argstreams=[
            InMemStream(),
            InMemStream(),
            response_body,
        ],
        scheme=ThriftArgScheme(FakeResult),
    )
    tchannel = mock.Mock()

    handler = build_handler(FakeResult, call)
    yield handler(req, res, tchannel)

    response_body.write.assert_called_once_with(
        bytearray([
            0x0c,                    # field type = TType.STRUCT
            0x00, 0x01,              # field ID = 1

            0x0b,                    # field type = TType.STRING
            0x00, 0x01,              # field ID = 1
            0x00, 0x00, 0x00, 0x04,  # string length = 5
        ] + list("fail") + [
            0x00,                    # end exception struct
            0x00,                    # end response struct
        ])
    )
    assert 1 == res.status_code
