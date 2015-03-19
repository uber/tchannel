from __future__ import absolute_import

import pytest

import tchannel.messages as tmessage
from tchannel.tornado import TChannel
from tchannel.tcurl import multi_tcurl


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

    [response] = yield multi_tcurl([hostport], [None], [None])

    assert response.arg_1 == call_response.arg_1
    assert response.arg_3 == call_response.arg_3
