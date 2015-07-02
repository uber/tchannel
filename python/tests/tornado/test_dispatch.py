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

import tornado.concurrent
import mock
import pytest

from tchannel.messages.error import ErrorCode
from tchannel.tornado.dispatch import RequestDispatcher


@pytest.fixture
def dispatcher():
    return RequestDispatcher()


@pytest.fixture
def req():
    # FIXME: This is crazy for a unit test!!
    request = mock.MagicMock(
        endpoint='foo',
        headers={'as': 'raw'},
    )
    endpoint_future = tornado.concurrent.Future()
    endpoint_future.set_result(None)
    request.argstreams[0].read.return_value = endpoint_future
    return request


@pytest.fixture
def connection():
    return mock.MagicMock()


@pytest.mark.gen_test
def test_handle_call(dispatcher, req, connection):
    def handler(req, response, proxy):
        response.write_body('bar')

    dispatcher.register('foo', handler)

    response = yield dispatcher.handle_call(req, connection)
    body = yield response.get_body()
    assert body == 'bar'


@pytest.mark.gen_test
def test_default_fallback_behavior(dispatcher, req, connection):
    """Undefined endpoints return 'Bad Request' errors."""
    yield dispatcher.handle_call(req, connection)
    assert connection.send_error.call_args[0][0] == ErrorCode.bad_request


@pytest.mark.gen_test
def test_custom_fallback_behavior(dispatcher, req, connection):
    def handler(req, response, proxy):
        response.write_body('bar')

    dispatcher.register(dispatcher.FALLBACK, handler)
    response = yield dispatcher.handle_call(req, connection)
    body = yield response.get_body()
    assert body == 'bar'
