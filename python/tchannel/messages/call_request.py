from __future__ import absolute_import

from .base import BaseMessage
from .types import Types
from ..parser import read_number
from ..parser import read_variable_length_key
from ..parser import write_number
from ..parser import write_variable_length_key


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

        'checksum_type',
        'checksum',

        'arg_1',
        'arg_2',
        'arg_3',
    )

    FLAGS_SIZE = 1
    TTL_SIZE = 4
    TRACE_SIZE = 8
    TRACEFLAGS_SIZE = 1
    SERVICE_SIZE = 1
    NH_SIZE = 1
    HEADER_SIZE = 1
    CSUMTYPE_SIZE = 1
    CSUM_SIZE = 4

    ARG_SIZE = 2

    def parse(self, payload, size):
        """Parse a call request message from a payload."""
        self.flags = read_number(payload, self.FLAGS_SIZE)
        self.ttl = read_number(payload, self.TTL_SIZE)

        self.span_id = read_number(payload, self.TRACE_SIZE)
        self.parent_id = read_number(payload, self.TRACE_SIZE)
        self.trace_id = read_number(payload, self.TRACE_SIZE)

        self.traceflags = read_number(payload, self.TRACEFLAGS_SIZE)

        self.service, _ = read_variable_length_key(payload, self.SERVICE_SIZE)

        self.headers, _ = self._read_headers(
            payload,
            self.NH_SIZE,
            self.HEADER_SIZE,
        )

        self.checksum_type = read_number(payload, self.CSUMTYPE_SIZE)
        if self.checksum_type:
            self.checksum = read_number(payload, self.CSUM_SIZE)

        # TODO check if we're at the end of the stream by counting bytes
        self.arg_1, _ = read_variable_length_key(
            payload,
            self.ARG_SIZE,
            decode=False,
        )
        self.arg_2, _ = read_variable_length_key(
            payload,
            self.ARG_SIZE,
            decode=False,
        )
        self.arg_3, _ = read_variable_length_key(
            payload,
            self.ARG_SIZE,
            decode=False,
        )

    def serialize(self, out):
        """Write a call request message out to a buffer."""
        out.extend(write_number(self.flags, self.FLAGS_SIZE))
        out.extend(write_number(self.ttl, self.TTL_SIZE))

        out.extend(write_number(self.span_id, self.TRACE_SIZE))
        out.extend(write_number(self.parent_id, self.TRACE_SIZE))
        out.extend(write_number(self.trace_id, self.TRACE_SIZE))
        out.extend(write_number(self.traceflags, self.TRACEFLAGS_SIZE))

        write_variable_length_key(out, self.service, self.SERVICE_SIZE)

        self._write_headers(out, self.headers, self.NH_SIZE, self.HEADER_SIZE)

        out.extend(write_number(self.checksum_type, self.CSUMTYPE_SIZE))
        if self.checksum_type:
            out.extend(write_number(self.checksum, self.CSUM_SIZE))

        write_variable_length_key(
            out,
            self.arg_1,
            self.ARG_SIZE,
            encode=False,
        )
        write_variable_length_key(
            out,
            self.arg_2,
            self.ARG_SIZE,
            encode=False,
        )
        write_variable_length_key(
            out,
            self.arg_3,
            self.ARG_SIZE,
            encode=False,
        )
