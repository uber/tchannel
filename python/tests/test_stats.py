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
from mock import MagicMock

from tchannel.errors import ProtocolError
from tchannel.errors import TimeoutError
from tchannel.messages import ErrorCode
from tchannel.stats import StatsHook
from tchannel.tornado import Request
from tchannel.tornado import Response
from tchannel.tornado.response import StatusCode


@pytest.fixture
def request():
    return Request(
        endpoint="endpoint1",
        service="test",
    )


@pytest.fixture
def stats_hook():
    stats = MagicMock()
    return StatsHook(
        stats=stats
    )


def test_before_send_request(stats_hook, request):
    stats_hook.before_send_request(request)
    stats_hook._stats.count.assert_called_with(
        "tchannel.outbound.calls.sent.no-service.test.endpoint1", 1
    )


def test_after_receive_response(stats_hook, request):
    response = Response(code=StatusCode.ok)
    stats_hook.after_receive_response(request, response)
    stats_hook._stats.count.assert_called_with(
        "tchannel.outbound.calls.success.no-service.test.endpoint1", 1
    )

    response = Response(code=StatusCode.error)
    stats_hook.after_receive_response(request, response)
    stats_hook._stats.count.assert_called_with(
        "tchannel.outbound.calls.app-errors.no-service.test.endpoint1", 1
    )


def test_after_receive_system_error(stats_hook, request):
    error = ProtocolError(code=ErrorCode.bad_request, description="")
    stats_hook.after_receive_system_error(request, error)
    stats_hook._stats.count.assert_called_with(
        "tchannel.outbound.calls.system-errors.no-service." +
        "test.endpoint1.bad-request", 1
    )


def test_after_receive_system_error_per_attempt(stats_hook, request):
    error = ProtocolError(code=ErrorCode.bad_request, description="")
    stats_hook.after_receive_system_error_per_attempt(request, error)
    stats_hook._stats.count.assert_called_with(
        "tchannel.outbound.calls.per-attempt.system-errors.no-service." +
        "test.endpoint1.bad-request", 1
    )


def test_on_operational_error(stats_hook, request):
    error = TimeoutError()
    stats_hook.on_operational_error(request, error)
    stats_hook._stats.count.assert_called_with(
        "tchannel.outbound.calls.operational-errors.no-service." +
        "test.endpoint1.timeout", 1
    )


def test_on_operational_error_per_attempt(stats_hook, request):
    error = TimeoutError()
    stats_hook.on_operational_error_per_attempt(request, error)
    stats_hook._stats.count.assert_called_with(
        "tchannel.outbound.calls.per-attempt.operational-errors.no-service." +
        "test.endpoint1.timeout", 1
    )
