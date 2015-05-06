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

from tchannel.scheme import JsonArgScheme
from tchannel.tornado import TChannel
from tchannel.tornado import TornadoDispatcher
from tchannel.tornado.broker import ArgSchemeBroker
from tests.integration.server_manager import TChannelServerManager


@pytest.fixture
def sample_json():
    body = [
        {
            "age": 37,
            "company": "IMANT",
            "email": "cummingsbritt@imant.com",
            "friends": [
                {
                    "id": 0,
                    "name": "Meyer Shields"
                },
                {
                    "id": 1,
                    "name": "Shelia Patterson"
                },
                {
                    "id": 2,
                    "name": "Franco Spencer"
                }
            ],
            "latitude": 46.911329,
            "longitude": 133.490945,
            "phone": "+1 (978) 509-2329",
            "registered": "2014-10-19T15:05:42 +07:00",
            "tags": [
                "a",
                "bmollit",
                "caute",
                "daliqua",
                "epariatur",
                "fut",
            ]
        }
    ]

    return body


@pytest.fixture
def handlers():
    dispatcher = TornadoDispatcher()

    @dispatcher.route("json_echo", ArgSchemeBroker(JsonArgScheme()))
    @tornado.gen.coroutine
    def json_echo(request, response, proxy):
        header = yield request.get_header()
        body = yield request.get_body()

        response.write_header(header)
        response.write_body(body)

    return dispatcher


@pytest.yield_fixture
def json_server(random_open_port, handlers):
    with TChannelServerManager(
            port=random_open_port,
            dispatcher=handlers
    ) as manager:
        yield manager


@pytest.mark.gen_test
def test_json_trace(json_server, sample_json):
    endpoint = "json_echo"
    tchannel = TChannel()
    hostport = 'localhost:%d' % json_server.port
    client = tchannel.request(hostport)
    header = sample_json
    body = sample_json
    resp = yield ArgSchemeBroker(JsonArgScheme()).send(
        client,
        endpoint,
        header,
        body,
    )

    # compare header's json
    rheader = yield resp.get_header()
    assert rheader == header

    # compare body's json
    rbody = yield resp.get_body()
    assert rbody == body
