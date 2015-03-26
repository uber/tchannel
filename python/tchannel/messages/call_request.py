from __future__ import absolute_import

from .call_request_continue import CallRequestContinueMessage
from .types import Types
from .. import rw
from . import common, ChecksumType


class CallRequestMessage(CallRequestContinueMessage):
    """Initiate an RPC call."""
    message_type = Types.CALL_REQ

    __slots__ = (
        'ttl',
        'tracing',
        'service',
        'headers',
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
        super(CallRequestMessage, self).__init__(flags, checksum, args)
        self.ttl = ttl
        self.tracing = tracing or common.Tracing(0, 0, 0, 0)
        self.service = service or ''
        self.headers = dict(headers) if headers else {}

    def encode(self):
        super(CallRequestMessage, self).encode()
        self.service = self.service.encode(common.ENCODE_TYPE)
        self.headers = dict(map(
            lambda (k, v): self.encode_pair(k, v),
            self.headers.iteritems()))

    def decode(self):
        super(CallRequestMessage, self).decode()
        self.service = self.service.decode(common.DECODE_TYPE)
        self.headers = dict(map(
            lambda (k, v): self.decode_pair(k, v),
            self.headers.iteritems()))

    def get_meta_size(self):
        size = 0
        size += 1       # flags: 1
        size += 4       # ttl: 4
        size += 25      # tracing: 24 | traceflags: 1
        size += 1       # service~1
        size += len(self.service)
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
    ("args", rw.args(rw.number(2))),    # [arg1~2, arg2~2, arg3~2]
)
