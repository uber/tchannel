from __future__ import absolute_import

from .types import Types
from .call_request import CallRequestMessage


class CallResponseMessage(CallRequestMessage):
    """Respond to an RPC call."""
    message_type = Types.CALL_RES

    __slots__ = (
        'flags',
        'code',

        # Zipkin-style tracing data
        'span_id',
        'parent_id',
        'trace_id',

        'traceflags',

        'headers',
        'checksum_type',
        'checksum',

        'arg_1',
        'arg_2',
        'arg_3',
    )
