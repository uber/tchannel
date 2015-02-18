from __future__ import absolute_import

from .exceptions import InvalidMessageException
from .types import Types
from .parser import read_short
from .parser import read_key_value


_BASE_FIELDS = ()


class BaseMessage(object):
    """Represent common functionality across all TChannel messages."""
    # Micro-optimizations are the best kinds of optimizations
    message_type = None
    message_id = None

    __slots__ = _BASE_FIELDS

    def parse(self, payload, size):
        """Parse a payload into a message.

        This is defined by bytes 16 and above of the message body, e.g. after
        the size and flags have been parsed.

        Payload may be ``None`` if size is 0.
        """
        raise NotImplementedError()


class InitRequestMessage(BaseMessage):
    """Initialize a connection to a TChannel server."""
    message_type = Types.INIT_REQ
    VERSION_SIZE = 2
    HEADER_SIZE = 2

    __slots__ = _BASE_FIELDS + (
        'version',
        'headers',
    )

    def parse(self, payload, size):
        self.version = read_short(payload)
        self.headers = {}

        offset = self.VERSION_SIZE
        while offset < size:
            header_name, header_value, bytes_read = read_key_value(
                payload,
                self.HEADER_SIZE,
            )
            offset += bytes_read
            self.headers[header_name] = header_value


class InitResponseMessage(InitRequestMessage):
    """Respond to an initialization request message."""
    message_type = Types.INIT_RES


class CallRequestMessage(BaseMessage):
    """Initiate an RPC call."""
    message_type = Types.CALL_REQ

    __slots__ = _BASE_FIELDS + (
        # Zipkin-style tracing data
        'span_id',
        'parent_id',
        'trace_id',
    )


class CallResponseMessage(CallRequestMessage):
    """Respond to an RPC call."""
    message_type = Types.CALL_RES


class PingRequestMessage(BaseMessage):
    """Initiate a ping request."""
    message_type = Types.PING_REQ

    def parse(self, payload, size):
        if size > 0:
            raise InvalidMessageException('Ping messages cannot have a body')


class PingResponseMessage(PingRequestMessage):
    """Respond to a ping request."""
    message_type = Types.PING_RES
