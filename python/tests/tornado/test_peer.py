# encoding=utf8

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
from tornado import gen

from tchannel.tornado import peer as tpeer
from tchannel.tornado.stream import InMemStream
from tchannel.tornado.stream import read_full


def closed_stream(body):
    """Builds an in-memory stream whose entire request body is the given string.

    :param body:
        Request body for the returned Stream
    """
    stream = InMemStream(body)
    stream.close()
    return stream


def mocked_stream():
    # An object that conforms to the stream interface but isn't an instance of
    # Stream.
    def reader():
        if stream.read.call_count == 3:
            return gen.maybe_future('')
        else:
            return gen.maybe_future('foo')

    stream = mock.Mock()
    stream.read.side_effect = reader

    return stream


def test_basic_peer_management_operations():
    peer_group = tpeer.PeerGroup(mock.MagicMock())

    assert not peer_group.hosts
    assert not peer_group.peers
    assert not peer_group.lookup('localhost:4040')

    p = peer_group.get('localhost:4040')

    assert p
    assert peer_group.lookup('localhost:4040') is p
    assert peer_group.get('localhost:4040') is p

    assert peer_group.remove('localhost:4040') is p
    assert not peer_group.lookup('localhost:4040')

    peer_group.add(p)
    assert peer_group.hosts == ['localhost:4040']
    assert peer_group.peers == [p]


@pytest.mark.parametrize('s, expected', [
    (None, b''),
    ('foo', b'foo'),
    (u'☃', b'\xe2\x98\x83'),
    (bytearray([0x12, 0x34]), b'\x12\x34'),
    (closed_stream('foo'), b'foo'),
    (mocked_stream(), b'foofoo')
])
@pytest.mark.gen_test
def test_maybe_stream(s, expected):
    got = yield read_full(tpeer.maybe_stream(s))
    assert expected == got


@pytest.mark.gen_test
def test_peer_group_clear_multiple():
    # Multiple concurrent reset attempts should not conflict with each other.

    peer_group = tpeer.PeerGroup(mock.MagicMock())
    for i in xrange(10):
        peer_group.get('localhost:404%d' % i)

    # A peer that will intentionally take a while to close.
    dirty_peer = mock.MagicMock()
    dirty_peer.close.side_effect = lambda: gen.sleep(0.1)
    peer_group.add(dirty_peer)

    yield [peer_group.clear() for i in xrange(10)]

    # Dirty peer must have been closed only once.
    dirty_peer.close.assert_called_once_with()

    for i in xrange(10):
        assert not peer_group.lookup('localhost:404%d' % i)


@pytest.mark.gen_test
def test_peer_connection_failure():
    # Test connecting a peer when the first connection attempt fails.

    MockConnection = mock.MagicMock()
    connection = mock.MagicMock()

    with mock.patch.object(tpeer.Peer, 'connection_class', MockConnection):

        @gen.coroutine
        def try_connect(*args, **kwargs):
            if MockConnection.outgoing.call_count == 1:
                # If this is the first call, fail.
                raise ZeroDivisionError('great sadness')
            else:
                raise gen.Return(connection)

        MockConnection.outgoing.side_effect = try_connect

        peer = tpeer.Peer(mock.MagicMock(), 'localhost:4040')

        future = peer.connect()
        with pytest.raises(ZeroDivisionError) as excinfo:
            yield future
        assert 'great sadness' in str(excinfo)

        got = yield peer.connect()
        assert got is connection

        assert MockConnection.outgoing.call_count == 2
