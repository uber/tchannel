from __future__ import absolute_import

from .base import BaseMessage
from .types import Types
from .. import rw
from . import common


class CallResponseMessage(BaseMessage):
    """Respond to an RPC call."""
    message_type = Types.CALL_RES

    __slots__ = (
        'flags',
        'code',
        'tracing',
        'headers',
        'checksum',
        'arg_1',
        'arg_2',
        'arg_3',
    )

    CODE_SIZE = 1

    def __init__(
        self,
        flags=0,
        code=0,
        tracing=None,
        headers=None,
        checksum=None,
        arg_1=None,
        arg_2=None,
        arg_3=None,
    ):
        self.flags = flags
        self.code = code
        self.tracing = tracing or common.Tracing(0, 0, 0, 0)
        self.headers = dict(headers) if headers else {}
        if checksum is not None:
            checksum = common.ChecksumType.standardize(checksum)
        self.checksum = checksum or \
            (common.ChecksumType.none, None)

        self.arg_1 = arg_1 or ''
        self.arg_2 = arg_2 or ''
        self.arg_3 = arg_3 or ''


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

    ("arg_1", rw.len_prefixed_string(rw.number(2), is_binary=True)),  # arg1~2
    ("arg_2", rw.len_prefixed_string(rw.number(2), is_binary=True)),  # arg2~2
    ("arg_3", rw.len_prefixed_string(rw.number(2), is_binary=True)),  # arg3~2
)
