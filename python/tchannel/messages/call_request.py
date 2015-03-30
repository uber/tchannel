from __future__ import absolute_import

from .call_request_continue import CallRequestContinueMessage
from .types import Types
from .. import rw
from . import common


class CallRequestMessage(CallRequestContinueMessage):
    """Initiate an RPC call."""
    message_type = Types.CALL_REQ

    __slots__ = (
        'flags',
        'ttl',
        'tracing',
        'service',
        'headers',
        'checksum',
        'args'
    )

    def __init__(
        self,
        flags=0,
        ttl=10,
        tracing=None,
        service=None,
        headers=None,
        checksum=None,
        args=None,
    ):
        args = args or ["", "", ""]
        super(CallRequestMessage, self).__init__(flags, checksum, args)
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
