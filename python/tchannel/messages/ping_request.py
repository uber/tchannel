from __future__ import absolute_import

from .. import rw
from .base import BaseMessage
from .types import Types


class PingRequestMessage(BaseMessage):
    """Initiate a ping request."""
    message_type = Types.PING_REQ

ping_req_rw = rw.instance(PingRequestMessage)  # no body
