from __future__ import absolute_import

from .ping_request import PingRequestMessage
from .types import Types


class PingResponseMessage(PingRequestMessage):
    """Respond to a ping request."""
    message_type = Types.PING_RES
