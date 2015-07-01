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

from . import common
from .. import rw
from ..enum import enum
from .base import BaseMessage
from .types import Types

ErrorCode = enum(
    'ErrorCode',
    timeout=0x01,
    cancelled=0x02,
    busy=0x03,
    declined=0x04,
    unexpected=0x05,
    bad_request=0x06,
    network_error=0x07,
    unhealthy=0x08,
    fatal=0xff,
)

error_code_rw = rw.number(1)


class ErrorMessage(BaseMessage):
    """Respond to a CALL_REQ with a failure at the protocol level."""
    message_type = Types.ERROR

    __slots__ = BaseMessage.__slots__ + (
        'code',
        'tracing',
        'description',
    )

    ERROR_CODES = {
        ErrorCode.timeout: 'timeout',
        ErrorCode.cancelled: 'cancelled',
        ErrorCode.busy: 'busy',
        ErrorCode.declined: 'declined',
        ErrorCode.unexpected: 'unexpected',
        ErrorCode.bad_request: 'bad request',
        ErrorCode.network_error: 'network error',
        ErrorCode.unhealthy: 'unhealthy error',
        ErrorCode.fatal: 'fatal protocol error'
    }

    def __init__(self, code=None, tracing=None, description=None, id=0):
        super(ErrorMessage, self).__init__(id)
        self.code = code if code else ErrorCode.unexpected
        self.description = description or ''
        self.tracing = tracing or common.Tracing(0, 0, 0, 0)

    def error_name(self):
        """Get a friendly error message."""
        return self.ERROR_CODES.get(self.code)


error_rw = rw.instance(
    ErrorMessage,
    ('code', error_code_rw),                            # code:1
    ('tracing', common.tracing_rw),                     # tracing:24
    ('description', rw.len_prefixed_string(rw.number(2)))   # message~2
)
