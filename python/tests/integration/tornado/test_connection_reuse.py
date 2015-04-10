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

from tchannel.tornado.dispatch import TornadoDispatcher
from tchannel.tornado.tchannel import TChannel
from tornado import gen


@pytest.mark.gen_test
def test_reuse():
    port1 = unused_port()
    port2 = unused_port()

    dispatch1 = TornadoDispatcher()
    dispatch2 = TornadoDispatcher()

    server1 = TChannel('localhost:%d' % port1, ignore_singleton=True)
    server1.host(dispatch1).listen(port1)

    server2 = TChannel('localhost:%d' % port2, ignore_singleton=True)
    server2.host(dispatch2).listen(port2)

    @dispatch2.route("hello")
    def hello(request, response, opts):
        response.write(arg3='hello to you too')

    @gen.coroutine
    def loop1(n):
        futures = []
        for i in xrange(n):
            futures.append(server1.request('localhost:%d' % port2).send(
                'hello', '', ''
            ))
        results = yield futures
        for resp in results:
            assert resp.args[2] == 'hello to you too'

    yield loop1(1)

    assert server1.out_peers.get("localhost:%d" % port2)
    assert server2.in_peers[0][0] == "localhost:%d" % port1
    assert not server1.in_peers
    assert not server2.out_peers

    # At this point, since server2 already has an open incoming connection
    # from server1, we should re-use that for requests made from server2 to
    # server1

    @dispatch1.route('reverse')
    def reverse(request, response, opts):
        assert request.body == 'foo'
        response.write(arg3='bar')

    @gen.coroutine
    def loop2(n):
        futures = []
        for i in xrange(n):
            futures.append(server2.request('localhost:%d' % port1).send(
                'reverse', '', 'foo'
            ))
        results = yield futures
        for resp in results:
            assert resp.args[2] == 'bar'

    loop1_run = loop1(100)
    yield loop2(100)
    yield loop1_run

    assert server1.out_peers.get("localhost:%d" % port2)
    assert server2.in_peers[0][0] == "localhost:%d" % port1
    assert not server1.in_peers
    assert not server2.out_peers


def unused_port():
    """Find and return a random open TCP port."""
    sock = socket.socket(socket.AF_INET)
    try:
        sock.bind(('', 0))
        return sock.getsockname()[1]
    finally:
        sock.close()
