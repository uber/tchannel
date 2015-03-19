from __future__ import absolute_import

from .types import Types
from .init_request import InitRequestMessage
from .. import rw


class InitResponseMessage(InitRequestMessage):
    """Respond to an initialization request message."""
    message_type = Types.INIT_RES

init_res_rw = rw.instance(
    InitResponseMessage,
    ('version', rw.number(2)),  # version:2
    ('headers', rw.headers(     # nh:2 (key~2 value~2){nh}
        rw.number(2),
        rw.len_prefixed_string(rw.number(2)),
        rw.len_prefixed_string(rw.number(2)),
    )),
)
