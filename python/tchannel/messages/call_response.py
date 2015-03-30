from __future__ import absolute_import

from .call_response_continue import CallResponseContinueMessage
from .types import Types
from .. import rw
from . import common


class CallResponseMessage(CallResponseContinueMessage):
    """Respond to an RPC call."""
    message_type = Types.CALL_RES

    __slots__ = (
        'flags',
        'code',
        'tracing',
        'headers',
        'checksum',
        'args'
    )

    def __init__(
        self,
        flags=0,
        code=0,
        tracing=None,
        headers=None,
        checksum=None,
        args=None,
    ):
        args = args or ["", "", ""]
        super(CallResponseMessage, self).__init__(flags, checksum, args)
        self.code = code
        self.tracing = tracing or common.Tracing(0, 0, 0, 0)
        self.headers = dict(headers) if headers else {}


call_res_rw = rw.instance(
    CallResponseMessage,
    ("flags", rw.number(1)),    # flags:1
    ("code", rw.number(1)),     # code:1
    ("tracing", common.tracing_rw),     # tracing:24
                                        # traceflags: 1
    ("headers", rw.headers(             # nh:1 (hk~1 hv~1){nh}
        rw.number(1),
        rw.len_prefixed_string(rw.number(1))
    )),
    ("checksum", common.checksum_rw),   # csumtype:1 (csum:4){0, 1}
    ("args",
     rw.args(rw.number(2))),  # [arg1~2, arg2~2, arg3~2]
)
