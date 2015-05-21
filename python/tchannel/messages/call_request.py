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
from ..glossary import DEFAULT_TTL
from .call_request_continue import CallRequestContinueMessage
from .types import Types


class CallRequestMessage(CallRequestContinueMessage):
    """Initiate an RPC call."""
    message_type = Types.CALL_REQ

    __slots__ = CallRequestContinueMessage.__slots__ + (
        'ttl',
        'tracing',
        'service',
        'headers',
    )

    def __init__(
        self,
        flags=0,
        ttl=DEFAULT_TTL,
        tracing=None,
        service=None,
        headers=None,
        checksum=None,
        args=None,
        id=0
    ):
        args = args or ["", "", ""]
        super(CallRequestMessage, self).__init__(flags, checksum, args, id)
        self.ttl = ttl
        self.tracing = tracing or common.Tracing(0, 0, 0, 0)
        self.service = service or ''
        self.headers = dict(headers) if headers else {}

call_req_rw = rw.instance(
    CallRequestMessage,
    ("flags", rw.number(1)),    # flags:1
    ("ttl", rw.number(4)),      # ttl:4
    ("tracing", common.tracing_rw),     # tracing:24
                                        # traceflags: 1
    ("service", rw.len_prefixed_string(rw.number(1))),  # service~1
    ("headers", rw.headers(             # nh:1 (hk~1 hv~1){nh}
        rw.number(1),
        rw.len_prefixed_string(rw.number(1))
    )),
    ("checksum", common.checksum_rw),   # csumtype:1 (csum:4){0, 1}
    ("args",
     rw.args(rw.number(2))),  # [arg1~2, arg2~2, arg3~2]
)
