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

import json

import pytest
import tornado
import tornado.gen

from tchannel.tornado import TChannel
from tchannel.tornado.stream import InMemStream
from tchannel.zipkin.zipkin_trace import ZipkinTraceHook
from tests.integration.test_server import TestServer

try:
    from cStringIO import StringIO
except:
    from StringIO import StringIO


@tornado.gen.coroutine
def handler2(request, response, proxy):
    response.set_body_s(InMemStream("from handler2"))


@tornado.gen.coroutine
def handler1(request, response, proxy):
    header = yield request.get_header()
    res = yield proxy.request(header).send(
        "endpoint2",
        "",
        "",
        traceflag=True
    )
    body = yield res.get_body()
    yield response.write_header("from handler1")
    yield response.write_body(body)
    response.flush()


@pytest.fixture
def register(tchannel):
    tchannel.register("endpoint1", "raw", handler1)
    tchannel.register("endpoint2", "raw", handler2)


trace_buf = StringIO()


@pytest.yield_fixture
def trace_server(random_open_port):
    with TestServer(random_open_port) as server:
        register(server.tchannel)
        server.tchannel.hooks.register(
            ZipkinTraceHook(
                dst=trace_buf,
            ),
        )
        yield server


@pytest.mark.gen_test
def test_zipkin_trace(trace_server):
    endpoint = b'endpoint1'
    zipkin_tracer = ZipkinTraceHook(dst=trace_buf)
    tchannel = TChannel(name='test')
    tchannel.hooks.register(zipkin_tracer)

    hostport = 'localhost:%d' % trace_server.port

    response = yield tchannel.request(hostport).send(InMemStream(endpoint),
                                                     InMemStream(hostport),
                                                     InMemStream(),
                                                     traceflag=True,
                                                     ttl=4,
                                                     attempt_times=3,
                                                     retry_delay=0.0001,)
    header = yield response.get_header()
    body = yield response.get_body()
    assert header == "from handler1"
    assert body == "from handler2"
    traces = []
    for trace in trace_buf.getvalue().split("\n"):
        if trace:
            traces.append(json.loads(trace))

    trace_id = traces[0][0][u'trace_id']
    for trace in traces:
        assert trace_id == trace[0][u'trace_id']
        if trace[0][u'name'] == u'endpoint2':
            parent_span_id = trace[0][u'parent_span_id']
        else:
            span_id = trace[0][u'span_id']

    assert parent_span_id == span_id
