from __future__ import absolute_import

import pytest

from tchannel.tornado import TChannel


@pytest.mark.gen_test
def test_add_peer_caching():
    "Connections are long-lived and should not be recreated."""
    tchannel = TChannel()
    tchannel.peers = {'foo': 'bar'}
    result = yield tchannel.add_peer('foo')
    assert result == 'bar'


def test_remove_peer():
    tchannel = TChannel()
    tchannel.peers = {'foo': 'bar'}
    assert tchannel.remove_peer('foo') == 'bar'


@pytest.mark.gen_test
def test_get_peer_with_caching():
    tchannel = TChannel()
    tchannel.peers = {'foo': 'bar'}
    result = yield tchannel.get_peer('foo')
    assert result == 'bar'
