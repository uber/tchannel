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

from tchannel import tcurl
from tchannel.exceptions import ConnectionClosedException
from tchannel.tornado import TChannel
from tchannel.tornado.connection import StreamConnection
from tchannel.messages.error import ErrorCode
from tchannel.messages import Types
from tchannel.tornado.stream import InMemStream
from tests.util import big_arg
from tchannel.tornado.dispatch import Response


@pytest.fixture
def call_response():
    return Response(
        argstreams=[
            InMemStream(b'hello'),
            InMemStream(''),
            InMemStream('world')
        ]
    )


@pytest.mark.gen_test
def test_tornado_client_with_server_not_there(random_open_port):
    with pytest.raises(ConnectionClosedException):
        yield StreamConnection.outgoing(
            'localhost:%d' % random_open_port,
        )


# TODO test case will fail due to StreamClosedError when
# increase the LARGE_AMOUNT to even bigger
@pytest.mark.gen_test
@pytest.mark.parametrize('arg2, arg3', [
        ("", big_arg()),
        (big_arg(), ""),
        ("test", big_arg()),
        (big_arg(),  "test"),
        (big_arg(), big_arg()),
        ("", ""),
        ("test", "test"),
    ],
    ids=lambda arg: str(len(arg))
)
def test_tchannel_call_request_fragment(tchannel_server,
                                        arg2, arg3):
    endpoint = b'tchannelpeertest'

    tchannel_server.expect_call(endpoint).and_return(Response(
        argstreams=[
            InMemStream(endpoint),
            InMemStream(arg2),
            InMemStream(arg3)
        ]
    ))

    tchannel = TChannel()

    hostport = 'localhost:%d' % (tchannel_server.port)

    response = yield tchannel.request(hostport).send(InMemStream(endpoint),
                                                     InMemStream(arg2),
                                                     InMemStream(arg3))
    (rarg1, rarg2, rarg3) = yield response.get_all_args()
    assert rarg1 == endpoint
    assert rarg3 == arg3


@pytest.mark.gen_test
def test_tcurl(server):
    endpoint = b'tcurltest'

    server.expect_call(endpoint).and_return(Response(
        argstreams=[
            InMemStream(endpoint),
            InMemStream(),
            InMemStream("hello")
        ]
    ))

    hostport = 'localhost:%d/%s' % (
        server.port, endpoint.decode('ascii')
    )
    responses = yield tcurl.main(['--host', hostport, '-d', ''])

    # TODO: get multiple requests working here
    assert len(responses) == 1

    for response in responses:
        (rarg1, rarg2, rarg3) = yield response.get_all_args()
        assert rarg1 == endpoint
        assert rarg3 == "hello"


@pytest.mark.gen_test
def test_endpoint_not_found(tchannel_server, call_response):
    endpoint = b'tchanneltest'
    tchannel_server.expect_call(endpoint).and_return(call_response)
    tchannel = TChannel()

    hostport = 'localhost:%d' % (tchannel_server.port)

    response = yield tchannel.request(hostport).send(InMemStream(),
                                                     InMemStream(),
                                                     InMemStream())
    assert response.message_type == Types.ERROR
    assert response.code == ErrorCode.bad_request
