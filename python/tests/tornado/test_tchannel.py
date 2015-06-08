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

from tchannel.tornado import TChannel
from tchannel.tornado.peer import Peer


@pytest.fixture
def tchannel():
    return TChannel(caller_name='test')


@pytest.fixture
def peer(tchannel):
    return Peer(tchannel, "localhost:4040")


@pytest.mark.gen_test
def test_peer_caching(tchannel, peer):
    "Connections are long-lived and should not be recreated."""
    tchannel.peers.add(peer)
    assert tchannel.peers.get("localhost:4040") is peer


def test_known_peers():
    peers = ["localhost:%d" % port for port in range(4040, 4101)]
    tchannel = TChannel(known_peers=peers)

    for peer in peers:
        assert tchannel.peers.lookup(peer)
