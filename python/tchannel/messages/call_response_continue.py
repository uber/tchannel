from __future__ import absolute_import

from .call_response import CallResponseMessage
from .types import Types


class CallResponseContinueMessage(CallResponseMessage):
    """Represent a continuation of a call response (across multiple frames)."""
    message_type = Types.CALL_RES_CONTINUE
