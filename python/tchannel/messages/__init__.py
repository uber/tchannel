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

from .types import Types
from .error import ErrorMessage, ErrorCode, error_rw
from .common import Tracing, ChecksumType
from .call_request import CallRequestMessage, call_req_rw
from .call_response import CallResponseMessage, call_res_rw
from .init_request import InitRequestMessage, init_req_rw
from .init_response import InitResponseMessage, init_res_rw
from .ping_request import PingRequestMessage, ping_req_rw
from .ping_response import PingResponseMessage, ping_res_rw
from .call_request_continue import call_req_c_rw
from .call_response_continue import call_res_c_rw

RW = {
    Types.CALL_REQ: call_req_rw,
    Types.CALL_RES: call_res_rw,
    Types.ERROR: error_rw,
    Types.INIT_REQ: init_req_rw,
    Types.INIT_RES: init_res_rw,
    Types.PING_REQ: ping_req_rw,
    Types.PING_RES: ping_res_rw,
    Types.CALL_REQ_CONTINUE: call_req_c_rw,
    Types.CALL_RES_CONTINUE: call_res_c_rw,
}

__all__ = [
    "RW",
    "ChecksumType",
    "CallRequestMessage",
    "CallRequestContinueMessage",
    "CallResponseMessage",
    "CallResponseContinueMessage",
    "ErrorMessage",
    "ErrorCode",
    "InitRequestMessage",
    "InitResponseMessage",
    "PingRequestMessage",
    "PingResponseMessage",
    "Tracing",
]
