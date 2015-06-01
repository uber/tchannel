# Copyright (c) 2015 Uber Technologies, Inc.
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in
# all copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
# THE SOFTWARE.

from __future__ import absolute_import

from .. import rw
from .base import BaseMessage
from .common import PROTOCOL_VERSION
from .types import Types


class InitRequestMessage(BaseMessage):
    """Initialize a connection to a TChannel server."""
    message_type = Types.INIT_REQ
    HOST_PORT = 'host_port'
    PROCESS_NAME = 'process_name'

    # Micro-optimizations are the best kinds of optimizations
    __slots__ = BaseMessage.__slots__ + (
        'version',
        'headers',
    )

    def __init__(self, version=None, headers=None, id=0):
        super(InitRequestMessage, self).__init__(id)
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
