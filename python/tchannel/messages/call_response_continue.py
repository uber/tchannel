from __future__ import absolute_import

from .call_continue import CallContinueMessage
from .types import Types
from .. import rw
from . import common


class CallResponseContinueMessage(CallContinueMessage):
    """Represent a continuation of a call response (across multiple frames)."""
    message_type = Types.CALL_RES_CONTINUE

    def __init__(
        self,
        flags=0,
        checksum=None,
        args=None,
    ):
        super(CallResponseContinueMessage, self).__init__(flags, checksum, args)

    def fragment(self, space_left):
        fragment_msg = CallResponseContinueMessage()
        return super(CallResponseContinueMessage, self).fragment(space_left, fragment_msg)

call_res_c_rw = rw.instance(
    CallResponseContinueMessage,
    ("flags", rw.number(1)),    # flags:1
    ("checksum", common.checksum_rw),   # csumtype:1 (csum:4){0, 1}
    ("args", rw.args(rw.number(2))),    # [arg1~2, arg2~2, arg3~2]
)
