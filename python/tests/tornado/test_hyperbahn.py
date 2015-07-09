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
import mock
import pytest
import tornado

from tchannel.errors import ConnectionClosedError
from tchannel.tornado import TChannel
from tchannel.tornado import hyperbahn


def test_new_client_establishes_peers():
    routers = ['127.0.0.1:2300' + str(i) for i in xrange(5)]

    # TChannel knows about one of the peers already.
    channel = TChannel('test', known_peers=['127.0.0.1:23002'])

    hyperbahn.advertise(
        channel,
        'baz',
        routers,
    )

    for router in routers:
        assert channel.peers.lookup(router)


@pytest.mark.gen_test
def test_request():
    channel = TChannel(name='test')
    hyperbahn.advertise(channel, 'foo', ['127.0.0.1:23000'])

    # Just want to make sure all the plumbing fits together.

    with pytest.raises(ConnectionClosedError):
        yield channel.request(service='bar').send(
            arg1='baz',
            arg2='bam',
            arg3='boo',
            headers={'as': 'qux'},
        )


@pytest.mark.gen_test
def test_advertise():
    server = TChannel(name="test_server")

    @server.register('ad', 'json')
    @tornado.gen.coroutine
    def ad(request, response, proxy):
        body = yield request.get_body()
        response.write_body(body)

    server.listen()
    channel = TChannel(name='test')

    with mock.patch(
        'tchannel.tornado.hyperbahn._regular_advertise',
        autospec=True,
    ) as mock_regular_advertise:
        response = yield hyperbahn.advertise(
            channel,
            'test', [server.hostport]
        )

        result = yield response.get_body()
        assert mock_regular_advertise.called
        assert result == '{"services": [{"serviceName": "test", "cost": 0}]}'
