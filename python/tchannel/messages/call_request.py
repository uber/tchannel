from __future__ import absolute_import

from .base import BaseMessage
from .types import Types
from .. import rw
from . import common


class CallRequestMessage(BaseMessage):
    """Initiate an RPC call."""
    message_type = Types.CALL_REQ

    __slots__ = (
        'flags',
        'ttl',
        'tracing',

        'service',
        'headers',

        'checksum',

        'arg_1',
        'arg_2',
        'arg_3',
    )

    def __init__(
        self,
        flags=0,
        ttl=10,
        tracing=None,
        service=None,
        headers=None,
        checksum=None,
        arg_1=None,
        arg_2=None,
        arg_3=None,
    ):
        self.flags = flags
        self.ttl = ttl
        self.tracing = tracing or common.Tracing(0, 0, 0, 0)
        self.service = service or ''
        self.headers = dict(headers) if headers else {"as":"http"}
        if checksum is not None:
            checksum = common.ChecksumType.standardize(checksum)
        self.checksum = checksum or \
            (common.ChecksumType.none, None)

        self.arg_1 = arg_1 or ''
        self.arg_2 = arg_2 or ''
        self.arg_3 = arg_3 or ''


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

    ("arg_1", rw.len_prefixed_string(rw.number(2), is_binary=True)),  # arg1~2
    ("arg_2", rw.len_prefixed_string(rw.number(2), is_binary=True)),  # arg2~2
    ("arg_3", rw.len_prefixed_string(rw.number(2), is_binary=True)),  # arg3~2
)
