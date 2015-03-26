from __future__ import absolute_import

from .base import BaseMessage
from .call_response_continue import CallResponseContinueMessage
from .types import Types
from .. import rw
from . import common, ChecksumType


class CallResponseMessage(CallResponseContinueMessage):
    """Respond to an RPC call."""
    message_type = Types.CALL_RES

    __slots__ = (
        'flags'
        'code',
        'tracing',

        'service',
        'headers',
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
        super(CallResponseMessage, self).__init__(flags, checksum, args)
        self.code = code
        self.tracing = tracing or common.Tracing(0, 0, 0, 0)
        self.headers = dict(headers) if headers else {}

    def encode(self):
        super(CallResponseMessage, self).encode()
        self.headers = dict(map(
            lambda (k, v): self.encode_pair(k, v),
            self.headers.iteritems()))

    def decode(self):
        super(CallResponseMessage, self).decode()
        self.headers = dict(map(
            lambda (k, v): self.decode_pair(k, v),
            self.headers.iteritems()))

    def get_meta_size(self):
        size = 0
        size += 1       # flags: 1
        size += 4       # ttl: 4
        size += 25      # tracing: 24 | traceflags: 1
        size += 1       # nh: 1
        for k, v in self.headers:
            size += 1       # hk~1
            size += len(k)
            size += 1       # hv~1
            size += len(v)

        size += 1       # csumtype: 1
        size += 1 if self.checksum[0] != ChecksumType.none else 0
        return size

    def get_size(self):
        size = self.get_meta_size()

        for arg in self.args:
            size += 2
            size += len(arg)
        return size


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
    ("args", rw.args(rw.number(2))),    # [arg1~2, arg2~2, arg3~2]
)
