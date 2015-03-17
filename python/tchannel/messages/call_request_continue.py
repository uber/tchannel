from __future__ import absolute_import

from .call_request import CallRequestMessage
from .types import Types


class CallRequestContinueMessage(CallRequestMessage):
    """Represent a continuation of a call request (across multiple frames)."""
    message_type = Types.CALL_REQ_CONTINUE

    # TODO
