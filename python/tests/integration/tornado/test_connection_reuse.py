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

import socket

import pytest
from tornado import gen

from tchannel.tornado.dispatch import TornadoDispatcher
from tchannel.tornado.stream import InMemStream
from tchannel.tornado.tchannel import TChannel


@pytest.mark.gen_test
def test_reuse():
    dispatch1 = TornadoDispatcher()
    dispatch2 = TornadoDispatcher()

    hostport1 = 'localhost:%d' % unused_port()
    hostport2 = 'localhost:%d' % unused_port()

    server1 = TChannel(hostport1)
    server1.host(dispatch1).listen()

    server2 = TChannel(hostport2)
    server2.host(dispatch2).listen()

    @dispatch2.route('hello')
    @gen.coroutine
    def hello(request, response, opts):
        yield response.write_body('hello to you too')

    @gen.coroutine
    def loop1(n):
        results = yield [
            server1.request(hostport2).send(
                InMemStream('hello'),
                InMemStream(),
                InMemStream()
            ) for i in xrange(n)
        ]
        for resp in results:
            body = yield resp.get_body()
            assert body == 'hello to you too'

    yield loop1(2)

    # Peer representing 2 for 1's point-of-view
    peer_1_2 = server1.peers.lookup(hostport2)

    # Peer representing 1 from 2's point-of-view
    peer_2_1 = server2.peers.lookup(hostport1)

    assert len(peer_1_2.outgoing_connections) == 1
    assert len(peer_2_1.incoming_connections) == 1

    assert not peer_1_2.incoming_connections
    assert not peer_2_1.outgoing_connections

    # At this point, since server2 already has an open incoming connection
    # from server1, we should re-use that for requests made from server2 to
    # server1

    @dispatch1.route('reverse')
    @gen.coroutine
    def reverse(request, response, opts):
        body = yield request.get_body()
        assert body == 'foo'
        yield response.write_body('bar')

    @gen.coroutine
    def loop2(n):
        results = yield [
            server2.request(hostport1).send(
                InMemStream('reverse'),
                InMemStream(),
                InMemStream('foo')
            ) for i in xrange(n)
        ]
        for resp in results:
            body = yield resp.get_body()
            assert body == 'bar'

    loop1_run = loop1(1)
    yield loop2(1)
    yield loop1_run

    assert len(peer_1_2.outgoing_connections) == 1
    assert len(peer_2_1.incoming_connections) == 1

    assert not peer_1_2.incoming_connections
    assert not peer_2_1.outgoing_connections


def unused_port():
    """Find and return a random open TCP port."""
    sock = socket.socket(socket.AF_INET)
    try:
        sock.bind(('', 0))
        return sock.getsockname()[1]
    finally:
        sock.close()
