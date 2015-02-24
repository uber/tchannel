from __future__ import absolute_import

from .types import Types
from .init_request import InitRequestMessage


class InitResponseMessage(InitRequestMessage):
    """Respond to an initialization request message."""
    message_type = Types.INIT_RES
