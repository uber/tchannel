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

from tornado import concurrent

from tchannel.tornado import TChannel


@pytest.fixture
def peer():
    future = concurrent.Future()
    future.set_result("some connection")
    return future


@pytest.mark.gen_test
def test_get_peer_out_caching(peer):
    "Connections are long-lived and should not be recreated."""
    tchannel = TChannel()
    tchannel.out_peers = {'foo': peer}
    result = yield tchannel.get_peer('foo')
    assert result == "some connection"


@pytest.mark.gen_test
def test_get_peer_in_caching(peer):
    "Connections are long-lived and should not be recreated."""
    tchannel = TChannel()
    tchannel.out_peers = {'foo': peer}
    tchannel.in_peers = [('foo', peer), ('foo', concurrent.Future())]
    result = yield tchannel.get_peer('foo')
    assert result == "some connection"


@pytest.mark.gen_test
def test_get_peer_with_caching(peer):
    tchannel = TChannel()
    tchannel.out_peers = {'foo': peer}
    result = yield tchannel.get_peer('foo')
    assert result == "some connection"
