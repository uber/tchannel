from __future__ import absolute_import

from ..exceptions import InvalidMessageException
from .base import BaseMessage
from .types import Types


class PingRequestMessage(BaseMessage):
    """Initiate a ping request."""
    message_type = Types.PING_REQ

    def parse(self, payload, size):
        if size > 0:
            raise InvalidMessageException('Ping messages cannot have a body')

    def serialize(self, out):
        """Serialize nothing to the wire."""
        return
