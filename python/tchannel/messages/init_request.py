from __future__ import absolute_import

from .base import BaseMessage
from .common import PROTOCOL_VERSION
from .types import Types
from .. import rw


class InitRequestMessage(BaseMessage):
    """Initialize a connection to a TChannel server."""
    message_type = Types.INIT_REQ
    HOST_PORT = 'host_port'
    PROCESS_NAME = 'process_name'

    # Micro-optimizations are the best kinds of optimizations
    __slots__ = (
        'version',
        'headers',
    )

    def __init__(self, version=None, headers=None):
        self.version = version or PROTOCOL_VERSION
        self.headers = dict(headers) if headers else {}

    @property
    def host_port(self):
        return self.headers.get(self.HOST_PORT)

    @host_port.setter
    def host_port(self, value):
        self.headers[self.HOST_PORT] = value

    @property
    def process_name(self):
        return self.headers.get(self.PROCESS_NAME)

    @process_name.setter
    def process_name(self, value):
        self.headers[self.PROCESS_NAME] = value


init_req_rw = rw.instance(
    InitRequestMessage,
    ('version', rw.number(2)),  # version:2
    ('headers', rw.headers(     # nh:2 (key~2 value~2){nh}
        rw.number(2),
        rw.len_prefixed_string(rw.number(2)),
        rw.len_prefixed_string(rw.number(2)),
    )),
)
