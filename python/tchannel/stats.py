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

from .event import EventHook
from .messages.error import ErrorMessage
from .tornado.response import StatusCode


class StatsHook(EventHook):

    def __init__(self, stats):
        self._stats = stats

    def before_send_request(self, request):
        stats_name = "tchannel.outbound.calls.sent"
        (service, target_service, target_endpoint) = (
            extract_meta_info_from_request(request))

        key = '.'.join([stats_name,
                        clean(service, 'service'),
                        clean(target_service, 'target-service'),
                        clean(target_endpoint, 'target-endpoint')
                        ])

        self._stats.count(key, 1)

    def after_receive_response(self, request, response):
        if response.code == StatusCode.ok:
            stats_name = "tchannel.outbound.calls.success"
        else:
            stats_name = "tchannel.outbound.calls.app-errors"
        (service, target_service, target_endpoint) = (
            extract_meta_info_from_request(request))
        key = '.'.join([stats_name,
                        clean(service, 'service'),
                        clean(target_service, 'target-service'),
                        clean(target_endpoint, 'target-endpoint')
                        ])

        self._stats.count(key, 1)

    def after_receive_system_error(self, request, error):
        stats_name = "tchannel.outbound.calls.system-errors"
        (service, target_service, target_endpoint) = (
            extract_meta_info_from_request(request))
        key = '.'.join([stats_name,
                        clean(service, 'service'),
                        clean(target_service, 'target-service'),
                        clean(target_endpoint, 'target-endpoint'),
                        clean(ErrorMessage.ERROR_CODES.
                              get(error.code, None), 'type')
                        ])

        self._stats.count(key, 1)

    def after_receive_system_error_per_attempt(self, request, error):
        stats_name = "tchannel.outbound.calls.per-attempt.system-errors"
        (service, target_service, target_endpoint) = (
            extract_meta_info_from_request(request))
        key = '.'.join([stats_name,
                        clean(service, 'service'),
                        clean(target_service, 'target-service'),
                        clean(target_endpoint, 'target-endpoint'),
                        clean(ErrorMessage.ERROR_CODES.
                              get(error.code, None), 'type')
                        ])

        self._stats.count(key, 1)

    def on_operational_error_per_attempt(self, request, error):
        stats_name = "tchannel.outbound.calls.per-attempt.operational-errors"
        (service, target_service, target_endpoint) = (
            extract_meta_info_from_request(request))
        key = '.'.join([stats_name,
                        clean(service, 'service'),
                        clean(target_service, 'target-service'),
                        clean(target_endpoint, 'target-endpoint'),
                        clean(ErrorMessage.ERROR_CODES.
                              get(error.code, None), 'type')
                        ])

        self._stats.count(key, 1)

    def on_operational_error(self, request, error):
        stats_name = "tchannel.outbound.calls.operational-errors"
        (service, target_service, target_endpoint) = (
            extract_meta_info_from_request(request))
        key = '.'.join([stats_name,
                        clean(service, 'service'),
                        clean(target_service, 'target-service'),
                        clean(target_endpoint, 'target-endpoint'),
                        clean(ErrorMessage.ERROR_CODES.
                              get(error.code, None), 'type')
                        ])

        self._stats.count(key, 1)


def extract_meta_info_from_request(request):
    service = request.headers.get('cn', None)
    target_service = request.service
    target_endpoint = request.endpoint

    return (service, target_service, target_endpoint)


def clean(key, field):
    if not key:
        return 'no-' + field
    else:

        return key.replace(
            ".", "-").replace(
            "\/", "-").replace(
            "{", "-").replace(
            "}", "-").replace(
            ":", "-").replace(
            " ", "-")
