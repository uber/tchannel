from __future__ import absolute_import
import socket

import pytest

from tchannel.socket import SocketConnection
from tchannel.exceptions import InvalidMessageException


@pytest.yield_fixture
def tchannel_pair():
    """Generate a pair of connected TChannels.

    Note that the nomenclature "server" and "client" are purely for
    readability; either side can initiate a request or fulfill an RPC call.
    """
    server, client = socket.socketpair()

    server_channel = SocketConnection(server)
    client_channel = SocketConnection(client)
    try:
        yield server_channel, client_channel
    finally:
        client.close()
        server.close()


@pytest.fixture
def dummy_headers():
    return {
        'host_port': 'fake:1234',
        'process_name': 'honeybooboo',
    }


def test_handshake(tchannel_pair, dummy_headers):
    """Validate the handshake exchange."""
    server, client = tchannel_pair

    client.initiate_handshake(headers=dummy_headers)
    server.await_handshake(headers=dummy_headers)
    client.await_handshake_reply()
    assert client.requested_version == server.requested_version


def test_handshake_missing_headers(tchannel_pair):
    """Verify we enforce required headers."""
    server, client = tchannel_pair

    client.initiate_handshake(headers={})
    with pytest.raises(InvalidMessageException):
        server.await_handshake(headers={})


def test_handshake_wrong_reply(tchannel_pair, dummy_headers):
    """Verify the third leg of the handshake must be an INIT_RES."""
    server, client = tchannel_pair

    client.initiate_handshake(headers=dummy_headers)
    server.initiate_handshake(headers=dummy_headers)
    with pytest.raises(InvalidMessageException):
        client.await_handshake_reply()


def test_handshake_with_callback(tchannel_pair, dummy_headers):
    server, client = tchannel_pair

    client.initiate_handshake(headers=dummy_headers)
    server.await_handshake(headers=dummy_headers)
    client.await_handshake_reply()


def test_handshake_pong(tchannel_pair):
    """Validate we handle invalid states."""
    server, client = tchannel_pair

    client.ping()
    with pytest.raises(InvalidMessageException):
        server.await_handshake(headers={})


def test_ping(tchannel_pair):
    """Validate the ping/pong exchange."""
    server, client = tchannel_pair

    message_id = client.ping()
    server.pong(message_id)


def test_handle_calls(tchannel_pair):
    """Verify handle_calls sends the message to our handler."""
    class _MyException(Exception):
        pass

    def my_handler(context, connection):
        raise _MyException()

    server, client = tchannel_pair
    client.ping()
    with pytest.raises(_MyException):
        server.handle_calls(my_handler)


def test_finish_connection(tchannel_pair):
    """Ensure we break out of the endless loop when client closes."""
    server, client = tchannel_pair
    client.ping()
    client.connection.close()

    def _handle(data, connection):
        pass
    server.handle_calls(_handle)
