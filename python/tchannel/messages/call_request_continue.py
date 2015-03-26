from __future__ import absolute_import

from .call_request import CallRequestMessage
from .types import Types
from .. import rw
from . import common


class CallRequestContinueMessage(CallRequestMessage):
    """Represent a continuation of a call request (across multiple frames)."""
    message_type = Types.CALL_REQ_CONTINUE

    __slots__ = (
        'flags',
        'checksum',
        'arg_1',
        'arg_2',
        'arg_3',
    )

    def __init__(
        self,
        flags=0,
        checksum=None,
        arg_1=None,
        arg_2=None,
        arg_3=None,
        args=None
    ):
        self.flags = flags
        if checksum is not None:
            checksum = common.ChecksumType.standardize(checksum)
        self.checksum = checksum or \
            (common.ChecksumType.none, None)

        self.arg_1 = arg_1 or ''
        self.arg_2 = arg_2 or ''
        self.arg_3 = arg_3 or ''


call_req_c_rw = rw.instance(
    CallRequestContinueMessage,
    ("flags", rw.number(1)),    # flags:1
    ("checksum", common.checksum_rw),   # csumtype:1 (csum:4){0, 1}

    ("arg_1", rw.len_prefixed_string(rw.number(2), is_binary=True)),  # arg1~2
    ("arg_2", rw.len_prefixed_string(rw.number(2), is_binary=True)),  # arg2~2
    ("arg_3", rw.len_prefixed_string(rw.number(2), is_binary=True)),  # arg3~2
)
