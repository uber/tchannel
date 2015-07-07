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

from tchannel.sync import TChannelSyncClient
from tchannel.sync.thrift import client_for


@pytest.fixture
def thrift_sync_client(tchannel_server, thrift_service):

    ServiceClient = client_for("service", thrift_service)

    tchannel_sync = TChannelSyncClient('test-client')
    hostport = 'localhost:%d' % tchannel_server.port

    thrift_sync_client = ServiceClient(tchannel_sync, hostport=hostport)

    return thrift_sync_client


@pytest.mark.integration
def test_call(tchannel_server, thrift_sync_client, thrift_service):
    expected = thrift_service.Item(
        key='foo', value=thrift_service.Value(integerValue=42)
    )

    tchannel_server.expect_call(
        thrift_service,
        'thrift',
        method='getItem',
    ).and_result(expected)

    future = thrift_sync_client.getItem('foo')
    result = future.result()

    assert expected == result
