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

from tchannel.event import EventHook
from tchannel.zipkin import annotation
from tchannel.zipkin.tracers import DebugTracer
from tchannel.zipkin.tracers import TChannelZipkinTracer


class ZipkinTraceHook(EventHook):
    """generate zipkin-style span for tracing"""

    def __init__(self, tchannel=None, dst=None):
        """Log zipkin style trace.

        :param tchannel:
            The tchannel instance to send zipkin trace spans
        :param dst:
            The destination to output trace information
        """

        if tchannel:
            # TChannelZipkinTracer generates Base64-encoded span
            # and uploads to zipkin server
            self.tracer = TChannelZipkinTracer(tchannel)
        else:
            # DebugTracer generates json style span info and writes
            # to dst. By default it writes to stdout
            self.tracer = DebugTracer(dst)

    def before_send_request(self, request):
        if not request.tracing.traceflags:
            return

        ann = annotation.client_send()
        request.tracing.annotations.append(ann)

    def before_receive_request(self, request):
        if not request.tracing.traceflags:
            return

        ann = annotation.server_recv()
        request.tracing.annotations.append(ann)

    def after_send_response(self, response):
        if not response.tracing.traceflags:
            return

        # send out a pair of annotations{server_recv, server_send} to zipkin
        ann = annotation.server_send()
        response.tracing.annotations.append(ann)
        self.tracer.record([(response.tracing, response.tracing.annotations)])

    def after_receive_response(self, request, response):
        if not response.tracing.traceflags:
            return

        # send out a pair of annotations{client_recv, client_send} to zipkin
        ann = annotation.client_recv()
        response.tracing.annotations.append(ann)
        self.tracer.record([(response.tracing, response.tracing.annotations)])

    def after_receive_error(self, request, error):
        if not error.tracing.traceflags:
            return

        ann = annotation.client_recv()
        error.tracing.annotations.append(ann)
        self.tracer.record([(error.tracing, error.tracing.annotations)])

    def after_send_error(self, error):
        if not error.tracing.traceflags:
            return

        ann = annotation.server_send()
        error.tracing.annotations.append(ann)
        self.tracer.record([(error.tracing, error.tracing.annotations)])
