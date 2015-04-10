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

from thrift import Thrift

from tchannel import messages
from tchannel.tornado.tchannel import TChannel
from tchannel.thrift.transport import TChannelTornadoTransport
from tchannel.thrift.protocol import TChannelProtocolFactory

from .util import get_service_module


@pytest.yield_fixture
@pytest.mark.xfail
def service(tmpdir):
    with get_service_module(tmpdir, True) as m:
        yield m


def mk_client(service, port):
    tchannel = TChannel()
    hostport = "localhost:%d" % port
    return service.Client(
        TChannelTornadoTransport(tchannel, hostport, 'service'),
        TChannelProtocolFactory('Service'),
    )


@pytest.mark.gen_test
@pytest.mark.xfail
def test_call(tchannel_server, service):
    tchannel_server.expect_call('Service::putItem').and_return(
        messages.CallResponseMessage(
            args=[
                '',  # endpoint
                '',  # headers
                # For void responses, TBinaryProtocol puts a single 0 byte in
                # the response.
                '\x00',
            ]
        )
    )

    client = mk_client(service, tchannel_server.port)
    yield client.putItem(
        service.Item(key="foo", value=service.Value(stringValue='bar')),
        True
    )


@pytest.mark.gen_test
@pytest.mark.xfail
def test_protocol_error(tchannel_server, service):
    tchannel_server.expect_call('Service::getItem').and_return(
        messages.ErrorMessage(
            code=messages.ErrorCode.bad_request,
            message="stahp pls",
        ),
    )

    client = mk_client(service, tchannel_server.port)
    with pytest.raises(Thrift.TApplicationException) as excinfo:
        yield client.getItem("foo")
    assert 'stahp' in str(excinfo.value)


@pytest.mark.gen_test
@pytest.mark.xfail
def test_thrift_exception(tchannel_server, service):
    tchannel_server.expect_call('Service::getItem').and_return(
        messages.CallResponseMessage(
            code=1,
            args=[
                '',
                '',
                # struct = (fieldType:1 fieldId:2 <fieldValue>)* `0`
                # string = str~4
                # 0x0c = fieldType for structs
                # 0x0b = fieldType for strings
                '\x0c\x00\x01\x0b\x00\x01\x00\x00\x00\x05stahp\x00\x00'
            ],
        ),
    )

    client = mk_client(service, tchannel_server.port)
    with pytest.raises(service.ItemDoesNotExist) as excinfo:
        yield client.getItem("foo")
    assert 'stahp' in str(excinfo.value)
