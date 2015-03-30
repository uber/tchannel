from __future__ import absolute_import

from .types import Types
from .. import rw
from . import common
from .call_continue import CallContinueMessage


class CallRequestContinueMessage(CallContinueMessage):
    """Represent a continuation of a call request (across multiple frames)."""
    message_type = Types.CALL_REQ_CONTINUE

    def __init__(
        self,
        flags=0,
        checksum=None,
        args=None,
    ):
        super(CallRequestContinueMessage, self).__init__(flags, checksum, args)

    def fragment(self, space_left):
        fragment_msg = CallRequestContinueMessage()
        return super(CallRequestContinueMessage, self).\
            fragment(space_left, fragment_msg)


call_req_c_rw = rw.instance(
    CallRequestContinueMessage,
    ("flags", rw.number(1)),    # flags:1
    ("checksum", common.checksum_rw),   # csumtype:1 (csum:4){0, 1}
    ("args", rw.args(rw.number(2))),    # [arg1~2, arg2~2, arg3~2]
)
