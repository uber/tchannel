from __future__ import absolute_import

from ..parser import read_short
from ..parser import write_number
from .base import BaseMessage
from .common import PROTOCOL_VERSION
from .types import Types


class InitRequestMessage(BaseMessage):
    """Initialize a connection to a TChannel server."""
    message_type = Types.INIT_REQ
    VERSION_SIZE = 2
    NH_SIZE = 2
    HEADER_SIZE = 2

    HOST_PORT = 'host_port'
    PROCESS_NAME = 'process_name'

    # Micro-optimizations are the best kinds of optimizations
    __slots__ = (
        'version',
        'headers',
    )

    def parse(self, payload, size):
        self.version = read_short(payload)
        self.headers, _ = self._read_headers(
            payload,
            self.NH_SIZE,
            self.HEADER_SIZE,
        )

    def serialize(self, out):
        out.extend(write_number(PROTOCOL_VERSION, self.VERSION_SIZE))
        self._write_headers(out, self.headers, self.NH_SIZE, self.HEADER_SIZE)
