from __future__ import absolute_import

from .types import Types
from .error import ErrorMessage, error_rw
from .common import Tracing, ChecksumType
from .call_request import CallRequestMessage, call_req_rw
from .call_response import CallResponseMessage, call_res_rw
from .init_request import InitRequestMessage, init_req_rw
from .init_response import InitResponseMessage, init_res_rw
from .ping_request import PingRequestMessage, ping_req_rw
from .ping_response import PingResponseMessage, ping_res_rw
from .call_request_continue import call_req_c_rw
from .call_response_continue import call_res_c_rw

RW = {
    Types.CALL_REQ: call_req_rw,
    Types.CALL_RES: call_res_rw,
    Types.ERROR: error_rw,
    Types.INIT_REQ: init_req_rw,
    Types.INIT_RES: init_res_rw,
    Types.PING_REQ: ping_req_rw,
    Types.PING_RES: ping_res_rw,
    Types.CALL_REQ_CONTINUE: call_req_c_rw,
    Types.CALL_RES_CONTINUE: call_res_c_rw,
}

__all__ = [
    "RW",
    "ChecksumType",
    "CallRequestMessage",
    "CallRequestContinueMessage",
    "CallResponseMessage",
    "CallResponseContinueMessage",
    "ErrorMessage",
    "InitRequestMessage",
    "InitResponseMessage",
    "PingRequestMessage",
    "PingResponseMessage",
    "Tracing",
]
