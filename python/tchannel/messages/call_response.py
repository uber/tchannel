from __future__ import absolute_import

from ..parser import read_number
from ..parser import write_number

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

    CODE_SIZE = 1

    def parse(self, payload, size):
        """Parse a call request message from a payload."""
        self.flags = read_number(payload, self.FLAGS_SIZE)
        self.code = read_number(payload, self.CODE_SIZE)

        self.parse_trace(payload)

        self.headers, _ = self._read_headers(
            payload,
            self.NH_SIZE,
            self.HEADER_SIZE,
        )

        self.checksum_type = read_number(payload, self.CSUMTYPE_SIZE)
        csum_size = self.CHECKSUM[self.checksum_type]

        if self.checksum_type:
            self.checksum = read_number(payload, csum_size)

        self.parse_args(payload)

        self.extra_space_check(payload)

    def serialize(self, out):
        """Write a call request message out to a buffer."""
        out.extend(write_number(self.flags, self.FLAGS_SIZE))
        out.extend(write_number(self.code, self.code_SIZE))

        self.serialize_trace(out)

        self.serialize_header_and_checksum(out)

        self.serialize_args(out)
