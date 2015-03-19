from __future__ import absolute_import

from .. import rw
from .base import BaseMessage
from .types import Types


class PingResponseMessage(BaseMessage):
    """Respond to a ping request."""
    message_type = Types.PING_RES

ping_res_rw = rw.instance(PingResponseMessage)  # no body
