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
from mock import patch

from tchannel import errors
from tchannel.thrift import client_for as thrift_client_for
from tchannel.tornado import TChannel

from .util import get_service_module


@pytest.yield_fixture
def service(tmpdir):
    with get_service_module(tmpdir, True) as m:
        yield m


def mk_client(service, port, trace=False):
    tchannel = TChannel(name='test')
    hostport = "localhost:%d" % port
    return thrift_client_for("service", service)(tchannel, hostport, trace)


@pytest.mark.gen_test
def test_call(tchannel_server, service):
    tchannel_server.expect_call(
        service,
        'thrift',
        method='putItem',
    ).and_result(None)

    client = mk_client(service, tchannel_server.port)
    yield client.putItem(
        service.Item(key="foo", value=service.Value(stringValue='bar')),
        True
    )


@pytest.mark.gen_test
def test_protocol_error(tchannel_server, service):
    tchannel_server.expect_call(
        service,
        'thrift',
        method='getItem',
    ).and_raise(ValueError("I was not defined in the IDL"))

    client = mk_client(service, tchannel_server.port, trace=False)
    with pytest.raises(errors.ProtocolError):
        with patch(
            'tchannel.zipkin.tracers.TChannelZipkinTracer.record',
            autospec=True,
        ) as mock_trace_record:
            yield client.getItem("foo")

    assert not mock_trace_record.called


@pytest.mark.gen_test
def test_thrift_exception(tchannel_server, service):
    tchannel_server.expect_call(
        service,
        'thrift',
        method='getItem',
    ).and_raise(service.ItemDoesNotExist("stahp"))

    client = mk_client(service, tchannel_server.port, trace=True)

    with patch(
        'tchannel.zipkin.tracers.TChannelZipkinTracer.record',
        autospec=True,
    ) as mock_trace_record:
        with (
            pytest.raises(service.ItemDoesNotExist)
        ) as excinfo:
            yield client.getItem("foo")

    assert mock_trace_record.called
    assert 'stahp' in str(excinfo.value)


@pytest.mark.gen_test
def test_false_result(service):
    # Verify that we aren't treating False as None.

    app = TChannel(name='app')

    @app.register(service)
    def healthy(request, response, body):
        return False

    app.listen()

    client = TChannel(name='client')
    response = yield client.request(
        hostport=app.hostport, arg_scheme='thrift'
    ).send('Service::healthy', '\x00\x00', '\x00')

    body = yield response.get_body()
    assert body == '\x02\x00\x00\x00\x00'
