from __future__ import absolute_import

from .call_request import CallRequestMessage
from .call_request_continue import CallRequestContinueMessage
from .call_response import CallResponseMessage
from .call_response_continue import CallResponseContinueMessage
from .error import ErrorMessage
from .init_request import InitRequestMessage
from .init_response import InitResponseMessage
from .ping_request import PingRequestMessage
from .ping_response import PingResponseMessage


ALL_MESSAGES = [
    InitRequestMessage,
    InitResponseMessage,
    CallRequestMessage,
    CallRequestContinueMessage,
    CallResponseMessage,
    CallResponseContinueMessage,
    PingRequestMessage,
    PingResponseMessage,
    ErrorMessage,
]
