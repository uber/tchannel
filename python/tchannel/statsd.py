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

    def before_send_request(self, request):
        statsd_name = "tchannel.outbound.calls.sent"
        key = common_prefix(statsd_name, request)

        self._statsd.count(key, 1)

    def after_receive_response(self, request, response):
        if response.code == StatusCode.ok:
            statsd_name = "tchannel.outbound.calls.success"
        else:
            statsd_name = "tchannel.outbound.calls.app-errors"
        key = common_prefix(statsd_name, request)

        self._statsd.count(key, 1)

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

    def on_operational_error_per_attempt(self, request, error):
        statsd_name = "tchannel.outbound.calls.per-attempt.operational-errors"
        prefix = common_prefix(statsd_name, request)
        key = prefix + '.' + clean(
            ErrorMessage.ERROR_CODES.get(error.code, None), 'type'
        )

        self._statsd.count(key, 1)

    def on_operational_error(self, request, error):
        statsd_name = "tchannel.outbound.calls.operational-errors"

        prefix = common_prefix(statsd_name, request)
        key = prefix + '.' + clean(
            ErrorMessage.ERROR_CODES.get(error.code, None), 'type'
        )

        self._statsd.count(key, 1)


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
