from __future__ import absolute_import

from ..parser import read_number
from ..parser import read_variable_length_key
from ..parser import write_number
from ..parser import write_variable_length_key
from .base import BaseMessage
from .types import Types


class ErrorMessage(BaseMessage):
    """Respond to a CALL_REQ with a failure at the protocol level."""
    message_type = Types.ERROR
    __slots__ = (
        'code',
        'original_message_id',
        'message',
    )

    ERROR_CODES = {
        0x01: 'timeout',
        0x02: 'cancelled',
        0x03: 'busy',
        0x04: 'declined',
        0x05: 'unexpected',
        0x06: 'bad request',
        0xff: 'fatal protocol error'
    }

    def parse(self, payload, size):
        self.code = read_number(payload, 1)
        self.original_message_id = read_number(payload, 4)
        self.message, _ = read_variable_length_key(payload, 2)

    def serialize(self, out):
        out.extend(write_number(self.code, 1))
        out.extend(write_number(self.original_message_id, 4))
        write_variable_length_key(out, self.message, 2)

    def error_name(self):
        """Get a friendly error message."""
        return self.ERROR_CODES.get(self.code)
