from __future__ import absolute_import

from .base import BaseMessage
from .types import Types


class CallRequestMessage(BaseMessage):
    """Initiate an RPC call."""
    message_type = Types.CALL_REQ

    __slots__ = (
        'flags',
        'ttl',

        # Zipkin-style tracing data
        'span_id',
        'parent_id',
        'trace_id',

        'traceflags',
        'service',
        'headers',

        'arg1',
        'arg2',
        'arg3',
    )
