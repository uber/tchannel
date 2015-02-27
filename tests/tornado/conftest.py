from __future__ import absolute_import
import socket

import pytest
import tornado.iostream

from tchannel.tornado.connection import TornadoConnection


@pytest.yield_fixture
def tornado_pair():
    server, client = socket.socketpair()

    server_stream = tornado.iostream.IOStream(server)
    client_stream = tornado.iostream.IOStream(client)

    server_conn = TornadoConnection(server_stream)
    client_conn = TornadoConnection(client_stream)

    try:
        yield server_conn, client_conn

    finally:
        server_stream.close()
        client_stream.close()
