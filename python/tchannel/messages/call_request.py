from __future__ import absolute_import

import logging
import os

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

    CHECKSUM = {
        0x00: 0,
        0x01: 4,
        0x02: 4
    }

    FLAGS_SIZE = 1
    TTL_SIZE = 4
    # sizeOf(span_id) + sizeOf(parent_id) + sizeOf(trace_id) = 3*8 = 24
    TRACE_SIZE = 8
    TRACEFLAGS_SIZE = 1
    SERVICE_SIZE = 1
    NH_SIZE = 1
    HEADER_SIZE = 1
    CSUMTYPE_SIZE = 1

    ARG_LENGTH = 2

    def parse_trace(self, payload):
        self.span_id = read_number(payload, self.TRACE_SIZE)
        self.parent_id = read_number(payload, self.TRACE_SIZE)
        self.trace_id = read_number(payload, self.TRACE_SIZE)
        self.traceflags = read_number(payload, self.TRACEFLAGS_SIZE)

    def parse_args(self, payload):
        self.arg_1, _ = read_variable_length_key(
            payload,
            self.ARG_LENGTH,
            decode=False,
        )
        self.arg_2, _ = read_variable_length_key(
            payload,
            self.ARG_LENGTH,
            decode=False,
        )
        self.arg_3, _ = read_variable_length_key(
            payload,
            self.ARG_LENGTH,
            decode=False,
        )

    def parse(self, payload, size):
        """Parse a call request message from a payload."""
        self.flags = read_number(payload, self.FLAGS_SIZE)
        self.ttl = read_number(payload, self.TTL_SIZE)

        self.parse_trace(payload)

        self.service, _ = read_variable_length_key(payload, self.SERVICE_SIZE)

        self.headers, _ = self._read_headers(
            payload,
            self.NH_SIZE,
            self.HEADER_SIZE,
        )

        self.checksum_type = read_number(payload, self.CSUMTYPE_SIZE)
        if self.checksum_type:
            csum_size = self.CHECKSUM[self.checksum_type]
            self.checksum = read_number(payload, csum_size)

        self.parse_args(payload)
        self.extra_space_check(payload)

    def extra_space_check(self, payload):
        cur = payload.tell()
        payload.seek(0, os.SEEK_END)
        end = payload.tell()

        if cur != end:
            logging.error("Extra space exists in the end of payload!")

    def serialize_trace(self, out):
        out.extend(write_number(self.span_id, self.TRACE_SIZE))
        out.extend(write_number(self.parent_id, self.TRACE_SIZE))
        out.extend(write_number(self.trace_id, self.TRACE_SIZE))
        out.extend(write_number(self.traceflags, self.TRACEFLAGS_SIZE))

    def serialize_args(self, out):
        write_variable_length_key(
            out,
            self.arg_1,
            self.ARG_LENGTH,
            encode=False,
        )
        write_variable_length_key(
            out,
            self.arg_2,
            self.ARG_LENGTH,
            encode=False,
        )
        write_variable_length_key(
            out,
            self.arg_3,
            self.ARG_LENGTH,
            encode=False,
        )

    def serialize_header_and_checksum(self, out):
        self._write_headers(out, self.headers, self.NH_SIZE, self.HEADER_SIZE)

        out.extend(write_number(self.checksum_type, self.CSUMTYPE_SIZE))
        if self.checksum_type and self.checksum:
            out.extend(write_number(self.checksum,
                                    self.CHECKSUM[self.checksum_type]))

    def serialize(self, out):
        """Write a call request message out to a buffer."""
        out.extend(write_number(self.flags, self.FLAGS_SIZE))
        out.extend(write_number(self.ttl, self.TTL_SIZE))

        self.serialize_trace(out)

        write_variable_length_key(out, self.service, self.SERVICE_SIZE)

        self.serialize_header_and_checksum(out)
        self.serialize_args(out)
