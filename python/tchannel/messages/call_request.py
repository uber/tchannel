from __future__ import absolute_import

from .types import Types
from .base import BaseMessage


class CallRequestMessage(BaseMessage):
    """Initiate an RPC call."""
    message_type = Types.CALL_REQ

    __slots__ = (
        # Zipkin-style tracing data
        'span_id',
        'parent_id',
        'trace_id',
    )
