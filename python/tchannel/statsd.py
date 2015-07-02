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
import time
import re

from .event import EventHook
from .messages.error import ErrorMessage
from .tornado.response import StatusCode


WILDCHAR_REXP = re.compile(r'[{}/\\:\s.]+')


class StatsdHook(EventHook):
    """Collect Statsd information in the tchannel req/resp."""

    def __init__(self, statsd):
        """

        :param statsd: instance of `StatsD <https://github.com/etsy/statsd>`
        """
        self._statsd = statsd
        self.outbound_attempt = {}

    def before_send_request(self, request):
        statsd_name = "tchannel.outbound.calls.sent"
        key = common_prefix(statsd_name, request)

        self._statsd.count(key, 1)

    def before_send_request_per_attempt(self, request, retry_count):
        statsd_name = "tchannel.outbound.calls.retries"
        retry_count += 1
        key = common_prefix(statsd_name, request) + '.' + str(retry_count)

        self._statsd.count(key, 1)

        # record outbound call start time and retry_count
        self.outbound_attempt[request.tracing.span_id] = (time.time(),
                                                          retry_count)

    def after_receive_response(self, request, response):
        if response.code == StatusCode.ok:
            statsd_name = "tchannel.outbound.calls.success"
        else:
            statsd_name = "tchannel.outbound.calls.app-errors"
        key = common_prefix(statsd_name, request)

        self._statsd.count(key, 1)
        self.outbound_latency_per_attempt(request)

    def after_receive_system_error(self, request, error):
        statsd_name = "tchannel.outbound.calls.system-errors"
        prefix = common_prefix(statsd_name, request)
        key = prefix + '.' + clean(
            ErrorMessage.ERROR_CODES.get(error.code, None), 'type'
        )

        self._statsd.count(key, 1)

    def after_receive_system_error_per_attempt(self, request, error):
        statsd_name = "tchannel.outbound.calls.per-attempt.system-errors"
        prefix = common_prefix(statsd_name, request)
        key = prefix + '.' + clean(
            ErrorMessage.ERROR_CODES.get(error.code, None), 'type'
        )

        self._statsd.count(key, 1)
        self.outbound_latency_per_attempt(request)

    def on_operational_error_per_attempt(self, request, error):
        statsd_name = "tchannel.outbound.calls.per-attempt.operational-errors"
        prefix = common_prefix(statsd_name, request)
        key = prefix + '.' + clean(
            ErrorMessage.ERROR_CODES.get(error.code, None), 'type'
        )

        self._statsd.count(key, 1)
        self.outbound_latency_per_attempt(request)

    def on_operational_error(self, request, error):
        statsd_name = "tchannel.outbound.calls.operational-errors"

        prefix = common_prefix(statsd_name, request)
        key = prefix + '.' + clean(
            ErrorMessage.ERROR_CODES.get(error.code, None), 'type'
        )

        self._statsd.count(key, 1)

    def outbound_latency_per_attempt(self, request):
        if request.tracing.span_id not in self.outbound_attempt:
            return
        (start_time, retry_count) = self.outbound_attempt.pop(
            request.tracing.span_id)

        latency_statsd_name = "tchannel.outbound.calls.per-attempt.latency"
        key = common_prefix(latency_statsd_name, request) + '.' + str(
            retry_count)
        elapsed = (time.time() - start_time) * 1000.0

        self._statsd.timing(key, elapsed)


def extract_metadata(request):
    service = request.headers.get('cn', None)
    target_service = request.service
    target_endpoint = request.endpoint

    return (service, target_service, target_endpoint)


def common_prefix(statsd_name, request):
    (service, target_service, target_endpoint) = (
        extract_metadata(request)
    )

    return '.'.join([statsd_name,
                     clean(service, 'service'),
                     clean(target_service, 'target-service'),
                     clean(target_endpoint, 'target-endpoint')
                     ])


def clean(key, field):
    if not key:
        return 'no-' + field
    else:

        return WILDCHAR_REXP.sub('-', key)
