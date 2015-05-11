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

from tchannel.exceptions import ProtocolException
from tchannel.messages.call_request import CallRequestMessage
from tchannel.messages.call_request_continue import CallRequestContinueMessage
from tchannel.messages.common import ChecksumType
from tchannel.messages.common import FlagsType
from tchannel.tornado import RequestDispatcher
from tchannel.tornado import TChannel
from tchannel.tornado.connection import StreamConnection
from tests.integration.server_manager import TChannelServerManager


@tornado.gen.coroutine
def handler1(request, response, proxy):
    raise Exception("application uncaught exception")


@tornado.gen.coroutine
def handler2(request, response, proxy):
    response.set_header_s(request.get_header_s())
    response.set_body_s(request.get_body_s())


@pytest.fixture
def handlers():
    dispatcher = RequestDispatcher()
    dispatcher.register("endpoint1", handler1)
    dispatcher.register("endpoint2", handler2)
    return dispatcher


@pytest.yield_fixture
def tchannel_server(random_open_port, handlers):
    with TChannelServerManager(
            port=random_open_port,
            dispatcher=handlers) as manager:
        yield manager


@pytest.mark.gen_test
def test_unexpected_error_from_handler(tchannel_server):
    # test for invalid call request message
    hostport = 'localhost:%d' % tchannel_server.port
    tchannel = TChannel()
    connection = yield StreamConnection.outgoing(
        hostport=hostport,
        tchannel=tchannel,
    )

    callrequest = CallRequestMessage(
        flags=FlagsType.fragment,
        args=[
            'endpoint1',
            '',
            '',
        ]
    )
    # set a wrong checksum
    callrequest.checksum = (ChecksumType.crc32c, 1)
    with pytest.raises(ProtocolException):
        yield connection.send(callrequest)


@pytest.mark.gen_test
def test_invalid_message_during_streaming1(tchannel_server):
    # test for invalid call request message
    hostport = 'localhost:%d' % tchannel_server.port
    tchannel = TChannel()
    connection = yield StreamConnection.outgoing(
        hostport=hostport,
        tchannel=tchannel,
    )

    callrequest = CallRequestMessage(
        flags=FlagsType.fragment,
        args=[
            'endpoint2',
            'a',
            'a',
        ],
        headers={'as': 'raw'},
    )

    callreqcontinue = CallRequestContinueMessage(
        flags=FlagsType.fragment,
        args=[
            'a',
        ],
    )

    with pytest.raises(ProtocolException) as e:
        resp_future = connection.send(callrequest, 1)
        for _ in xrange(10):
            yield connection.write(callreqcontinue, 1)

        # by pass the default checksum calculation
        # set a wrong checksum
        callreqcontinue.checksum = (ChecksumType.crc32c, 1)
        yield connection._write(callreqcontinue, 1)
        yield resp_future

    assert e.value.message == u"Checksum does not match!"


@pytest.mark.gen_test
def test_continue_message_error(tchannel_server):
    # test for invalid call request message
    hostport = 'localhost:%d' % tchannel_server.port
    tchannel = TChannel()
    connection = yield StreamConnection.outgoing(
        hostport=hostport,
        tchannel=tchannel,
    )

    callreqcontinue = CallRequestContinueMessage(
        flags=FlagsType.fragment,
        args=[
            'a',
        ],
    )

    with pytest.raises(ProtocolException) as e:
        yield connection.send(callreqcontinue, 1)

    assert (e.value.message ==
            u"missing call message after receiving continue message")
