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
from .call_continue import CallContinueMessage
from .types import Types


class CallRequestContinueMessage(CallContinueMessage):
    """Represent a continuation of a call request (across multiple frames)."""
    message_type = Types.CALL_REQ_CONTINUE

    def __init__(
        self,
        flags=0,
        checksum=None,
        args=None,
        id=0,
    ):
        super(CallRequestContinueMessage, self).__init__(
            flags, checksum, args, id)

    def fragment(self, space_left):
        fragment_msg = CallRequestContinueMessage(
            flags=self.flags,
            checksum=self.checksum,
        )
        return super(CallRequestContinueMessage, self).\
            fragment(space_left, fragment_msg)


call_req_c_rw = rw.instance(
    CallRequestContinueMessage,
    ("flags", rw.number(1)),    # flags:1
    ("checksum", common.checksum_rw),   # csumtype:1 (csum:4){0, 1}
    ("args", rw.args(rw.number(2))),    # [arg1~2, arg2~2, arg3~2]
)
