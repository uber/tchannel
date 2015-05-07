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
import tornado
import tornado.gen
from doubles import InstanceDouble
from doubles import allow
from doubles import expect

from tchannel.tornado.dispatch import TornadoDispatcher
from tchannel.tornado.stream import InMemStream
from tchannel.zipkin.trace import Trace


@pytest.fixture
def req():
    request = InstanceDouble('tchannel.tornado.data.Request')
    request.endpoint = ""
    request.service = ""
    request.checksum = None
    request.headers = {'as': 'raw'}
    request.argstreams = [
        InMemStream("test"),
        InMemStream(),
        InMemStream()
    ]
    request.tracing = Trace()
    request.id = 0
    request.argstreams[0].close()
    return request


@pytest.fixture
def conn():
    conn = InstanceDouble('tchannel.tornado.connection.StreamConnection')
    allow(conn).send_error
    allow(conn).post_response
    conn.tchannel = None

    return conn


@pytest.mark.gen_test
def test_async_handler(req, conn):
    dispatcher = TornadoDispatcher()

    @dispatcher.route("test")
    @tornado.gen.coroutine
    def async(request, response, opts):
        response.argstreams = [
            InMemStream(),
            InMemStream(),
            InMemStream()
        ]

    expect(conn).post_response

    yield dispatcher.handle_call(req, conn)
