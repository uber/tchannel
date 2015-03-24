from __future__ import absolute_import

import pytest

import tchannel.messages as tmessage
from tchannel import tcurl
from tchannel.exceptions import ConnectionClosedException
from tchannel.exceptions import TChannelApplicationException
from tchannel.outgoing import OutgoingTChannel
from tchannel.tornado import TChannel
from tchannel.tornado.connection import TornadoConnection


@pytest.fixture
def call_response():
    return tmessage.CallResponseMessage(arg_1=b'hello', arg_3='world')


def test_tcp_ping_pong(server_manager):
    with server_manager.client_connection() as conn:
        resp = tmessage.PingResponseMessage()
        server_manager.expect_ping().and_return(resp)

        for i in range(1000):
            conn.ping()
            assert resp == conn.await().message


def test_outgoing_tchannel(server_manager, call_response):
    endpoint = b'tchanneltest'
    call_response.arg_1 = endpoint

    port = server_manager.port
    host_port = 'localhost:' + str(port)

    with OutgoingTChannel('test_outgoing_tchannel') as chan:
        chan.request(host_port).handshake()
        server_manager.expect_call_request(endpoint).and_return(call_response)

        response = chan.request(host_port).send(endpoint, None, None)

        assert response.arg_1 == call_response.arg_1
        assert response.arg_3 == call_response.arg_3


def test_outgoing_tchannel_exception(server_manager, call_response):
    endpoint = b'tchanneltest'
    call_response.arg_1 = endpoint
    call_response.code = 1

    port = server_manager.port
    host_port = 'localhost:' + str(port)

    with OutgoingTChannel('test_outgoing_tchannel_exception') as chan:
        chan.request(host_port).handshake()
        with pytest.raises(TChannelApplicationException):
            server_manager.expect_call_request(
                endpoint
            ).and_return(call_response)
            chan.request(host_port).send(endpoint, None, None)


def test_tcp_client_with_server_gone_away(server_manager):

    with server_manager.client_connection() as conn:
        server_manager.stop()

        with pytest.raises(ConnectionClosedException):
            conn.ping()

        assert conn.closed


@pytest.mark.gen_test
def test_tornado_client_with_server_gone_away(server_manager):
    "Establish a connection to the server and then kill the server."""

    conn = yield TornadoConnection.outgoing(
        'localhost:%s' % server_manager.port,
    )

    assert not conn.closed

    server_manager.stop()

    conn.ping()

    with pytest.raises(ConnectionClosedException):
        yield conn.awaiting_responses.values()

    assert conn.closed


@pytest.mark.gen_test
def test_tornado_client_with_server_not_there(unused_port):

    with pytest.raises(ConnectionClosedException):
        yield TornadoConnection.outgoing(
            'localhost:%d' % unused_port,
        )


@pytest.mark.gen_test
def test_tchannel_call_request(server_manager, call_response):
    endpoint = b'tchannelpeertest'
    call_response.arg_1 = endpoint

    server_manager.expect_call_request(endpoint).and_return(call_response)

    tchannel = TChannel()

    hostport = 'localhost:%d' % (server_manager.port)

    response = yield tchannel.request(hostport).send(endpoint, None, None)

    assert response.arg_1 == call_response.arg_1
    assert response.arg_3 == call_response.arg_3


@pytest.mark.gen_test
def test_tcurl(server_manager, call_response):
    endpoint = b'tcurltest'
    call_response.arg_1 = endpoint

    server_manager.expect_call_request(endpoint).and_return(call_response)

    hostport = 'localhost:%d/%s' % (
        server_manager.port, endpoint.decode('ascii')
    )

    [response] = yield tcurl.main(['--host', hostport])

    assert response.arg_1 == call_response.arg_1
    assert response.arg_3 == call_response.arg_3
