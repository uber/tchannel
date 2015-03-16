from __future__ import absolute_import

import socket

import pytest
import tornado.gen
import tornado.ioloop
import tornado.testing

from tchannel.tchannel import TChannel
from tchannel.tornado.connection import TornadoConnection


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


#@pytest.mark.gen_test
#def test_tchannel_make_out_connection():
    #server_sock, client_sock = socket.socketpair()

    #server_stream = tornado.iostream.IOStream(server_sock)
    #client_stream = tornado.iostream.IOStream(client_sock)

    #server_conn = TornadoConnection(server_stream)
    #client_conn = TornadoConnection(client_stream)

    #hostname = server_sock.getsockname()

    #tchannel = TChannel()
    #conn = yield tchannel.make_out_connection(':', sock=server_sock)
