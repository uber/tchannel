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
from doubles import allow
from doubles import expect
from doubles import InstanceDouble
import pytest
import tornado

from tchannel.handler import TChannelRequestHandler
from tchannel.messages import Types


@pytest.fixture
def handler():
    return TChannelRequestHandler()


@pytest.fixture
def message():
    message = InstanceDouble('tchannel.messages.base.BaseMessage')
    message.message_type = Types.CALL_REQ
    message.service = ''
    message.args = ['test', None, None]
    return message


@pytest.fixture
def context(message):
    context = InstanceDouble('tchannel.context.Context')
    allow(context).message.and_return(message)
    allow(context).message_id.with_args().and_return(1)

    return context


@pytest.fixture
def conn():
    conn = InstanceDouble('tchannel.tornado.connection.TornadoConnection')
    allow(conn).send_error
    allow(conn).finish

    return conn


def test_sync_handler(handler, context, conn):

    @handler.route("test")
    def sync(request, response, opts):
        response.write("done")

    expect(conn).finish

    handler.handle_request(context, conn)


@pytest.mark.gen_test
def test_async_handler(handler, context, conn):

    @handler.route("test")
    @tornado.gen.coroutine
    def async(request, response, opts):
        yield tornado.gen.sleep(0)
        response.write("done")

    expect(conn).finish

    yield handler.handle_request(context, conn)
