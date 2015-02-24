from __future__ import absolute_import

from .exceptions import InvalidMessageException
from .parser import read_key_value
from .parser import read_number
from .parser import read_short
from .parser import read_variable_length_key
from .parser import write_key_value
from .parser import write_number
from .parser import write_variable_length_key
from .types import Types


_BASE_FIELDS = ()
PROTOCOL_VERSION = 0x02


class BaseMessage(object):
    """Represent common functionality across all TChannel messages."""
    # Micro-optimizations are the best kinds of optimizations
    message_type = None

    __slots__ = _BASE_FIELDS

    def parse(self, payload, size):
        """Parse a payload into a message.

        This is defined by bytes 16 and above of the message body, e.g. after
        the size and flags have been parsed.

        Payload may be ``None`` if size is 0.
        """
        raise NotImplementedError()

    def serialize(self, out):
        """Serialize a message to its wire format.

        ``out`` is generally a ``bytearray`` which is a mutable sequence of
        bytes.

        This generates the ``payload`` section of the message.
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

    def serialize(self, out):
        out.extend(write_number(PROTOCOL_VERSION, self.VERSION_SIZE))
        for key, value in self.headers.items():
            out.extend(write_key_value(key, value, key_size=2))


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

    def serialize(self, out):
        """Serialize nothing to the wire."""
        return


class PingResponseMessage(PingRequestMessage):
    """Respond to a ping request."""
    message_type = Types.PING_RES


class ErrorMessage(BaseMessage):
    """Respond to a CALL_REQ with a failure at the protocol level."""
    message_type = Types.ERROR
    __slots__ = _BASE_FIELDS + (
        'code',
        'original_message_id',
        'message',
    )

    def parse(self, payload, size):
        self.code = read_number(payload, 1)
        self.original_message_id = read_number(payload, 4)
        self.message = read_variable_length_key(payload, 2)

    def serialize(self, out):
        out.extend(write_number(self.code, 1))
        out.extend(write_number(self.original_message_id, 4))
        write_variable_length_key(out, self.message, 2)
