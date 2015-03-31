from __future__ import absolute_import

import pytest

import tchannel.messages as tmessage
from tchannel import tcurl
from tchannel.exceptions import ConnectionClosedException
from tchannel.exceptions import TChannelApplicationException
from tchannel.outgoing import OutgoingTChannel
from tchannel.tornado import TChannel
from tchannel.tornado.connection import TornadoConnection
from tchannel.messages.error import ErrorCode
from tchannel.messages import Types


@pytest.fixture
def call_response():
    return tmessage.CallResponseMessage(arg_1=b'hello', arg_3='world')


def test_serial_ping_pong(tcp_server):
    with tcp_server.client_connection() as conn:
        resp = tmessage.PingResponseMessage()

        for i in range(1000):
            conn.ping()
            assert resp == conn.await().message


def test_outgoing_tchannel(tcp_server, call_response):
    endpoint = b'tchanneltest'
    call_response.arg_1 = endpoint

    port = tcp_server.port
    host_port = 'localhost:' + str(port)

    with OutgoingTChannel('test_outgoing_tchannel') as chan:
        chan.request(host_port).handshake()
        tcp_server.expect_call_request(endpoint).and_return(call_response)

        response = chan.request(host_port).send(endpoint, None, None)

        assert response.arg_1 == call_response.arg_1
        assert response.arg_3 == call_response.arg_3


def test_outgoing_tchannel_exception(tcp_server, call_response):
    endpoint = b'tchanneltest'
    call_response.arg_1 = endpoint
    call_response.code = 1

    port = tcp_server.port
    host_port = 'localhost:' + str(port)

    with OutgoingTChannel('test_outgoing_tchannel_exception') as chan:
        chan.request(host_port).handshake()
        with pytest.raises(TChannelApplicationException):
            tcp_server.expect_call_request(
                endpoint
            ).and_return(call_response)
            chan.request(host_port).send(endpoint, None, None)


def test_tcp_client_with_server_gone_away(tcp_server):

    with tcp_server.client_connection() as conn:
        tcp_server.stop()

        with pytest.raises(ConnectionClosedException):
            conn.ping()

        assert conn.closed


@pytest.mark.gen_test
def test_tornado_client_with_server_gone_away(tcp_server):
    "Establish a connection to the server and then kill the server."""

    conn = yield TornadoConnection.outgoing(
        'localhost:%s' % tcp_server.port,
    )

    assert not conn.closed

    tcp_server.stop()

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
def test_tchannel_call_request(tcp_server, call_response):
    endpoint = b'tchannelpeertest'
    call_response.arg_1 = endpoint

    tcp_server.expect_call_request(endpoint).and_return(call_response)

    tchannel = TChannel()

    hostport = 'localhost:%d' % (tcp_server.port)

    response = yield tchannel.request(hostport).send(endpoint, None, None)

    assert response.arg_1 == call_response.arg_1
    assert response.arg_3 == call_response.arg_3


@pytest.mark.gen_test
def test_tcurl(server, call_response):
    endpoint = b'tcurltest'
    call_response.arg_1 = endpoint

    server.expect_call_request(endpoint).and_return(call_response)

    hostport = 'localhost:%d/%s' % (
        server.port, endpoint.decode('ascii')
    )

    responses = yield tcurl.main(['--host', hostport, '-d', ''])

    # TODO: get multiple requests working here
    assert len(responses) == 1

    for response in responses:
        assert response.arg_1 == call_response.arg_1
        assert response.arg_3 == call_response.arg_3


@pytest.mark.gen_test
def test_endpoint_not_found(tchannel_server, call_response):
    endpoint = b'tchanneltest'
    tchannel_server.expect_call_request(endpoint).and_return(call_response)
    tchannel = TChannel()

    hostport = 'localhost:%d' % (tchannel_server.port)

    response = yield tchannel.request(hostport).send("", "", "")
    assert response.message_type == Types.ERROR
    assert response.code == ErrorCode.bad_request
