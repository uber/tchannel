from __future__ import absolute_import

import enum

from .. import rw
from .base import BaseMessage
from .types import Types


@enum.unique
class ErrorCode(enum.IntEnum):
    timeout = 0x01
    cancelled = 0x02
    busy = 0x03
    declined = 0x04
    unexpected = 0x05
    bad_request = 0x06
    fatal = 0xff

error_code_rw = rw.number(1)


class ErrorMessage(BaseMessage):
    """Respond to a CALL_REQ with a failure at the protocol level."""
    message_type = Types.ERROR

    __slots__ = (
        'code',
        'original_message_id',
        'message',
    )

    ERROR_CODES = {
        ErrorCode.timeout: 'timeout',
        ErrorCode.cancelled: 'cancelled',
        ErrorCode.busy: 'busy',
        ErrorCode.declined: 'declined',
        ErrorCode.unexpected: 'unexpected',
        ErrorCode.bad_request: 'bad request',
        ErrorCode.fatal: 'fatal protocol error'
    }

    def __init__(self, code=None, original_message_id=None, message=None):
        self.original_message_id = original_message_id
        self.code = ErrorCode(code) if code else ErrorCode.unexpected
        self.message = message or ''

    def error_name(self):
        """Get a friendly error message."""
        return self.ERROR_CODES.get(self.code)


error_rw = rw.instance(
    ErrorMessage,
    ('code', error_code_rw),                            # code:1
    ('original_message_id', rw.number(4)),              # id:4
    ('message', rw.len_prefixed_string(rw.number(2)))   # message~2
)
