from __future__ import absolute_import

import pytest

import tchannel.messages as tmessage
from tchannel.tchannel import TChannel
from tchannel.tcurl import tcurl


@pytest.fixture
def call_response():
    resp = tmessage.CallResponseMessage()
    resp.flags = 0
    resp.code = 0
    resp.span_id = 0
    resp.parent_id = 0
    resp.trace_id = 0
    resp.traceflags = 0
    resp.headers = {}
    resp.checksum_type = 0
    resp.checksum = 0
    resp.arg_1 = b'hello'
    resp.arg_2 = None
    resp.arg_3 = b'world'
    return resp


def test_tcp_ping_pong(server_manager):
    with server_manager.client_connection() as conn:
        resp = tmessage.PingResponseMessage()
        server_manager.expect_ping().and_return(resp)

        for i in range(1000):
            conn.ping()
            assert resp == next(conn).message


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

    hostport = 'localhost:%d' % (server_manager.port)

    response = yield tcurl(hostport, endpoint, None, None)

    assert response.arg_1 == call_response.arg_1
    assert response.arg_3 == call_response.arg_3
