from __future__ import absolute_import

import pytest

from tchannel.tornado import TChannel


@pytest.fixture
def peer():

    class PeerFuture(object):
        def running(self):
            return False

        def result(self):
            return self

    return PeerFuture()


@pytest.mark.gen_test
def test_add_peer_caching(peer):
    "Connections are long-lived and should not be recreated."""
    tchannel = TChannel()
    tchannel.peers = {'foo': peer}
    result = yield tchannel.add_peer('foo')
    assert result is peer


def test_remove_peer(peer):
    tchannel = TChannel()
    tchannel.peers = {'foo': peer}
    assert tchannel.remove_peer('foo') is peer


@pytest.mark.gen_test
def test_get_peer_with_caching(peer):
    tchannel = TChannel()
    tchannel.peers = {'foo': peer}
    result = yield tchannel.get_peer('foo')
    assert result is peer
