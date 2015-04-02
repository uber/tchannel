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

import json
from .connection import TornadoConnection
from ..messages import CallResponseMessage


class TornadoHttpConnection(TornadoConnection):
    def __init__(self, connection, context):
        super(TornadoHttpConnection, self).__init__(connection)
        self.context = context
        self.message = CallResponseMessage()
        self.id = context.message_id

    def write_headers(self, start_line, headers, chunk=None, callback=None):
        self.message.args[1] = json.dumps(headers) if headers else ''

    def write(self, chunk, callback=None):
        self.message.args[2] += chunk
        # TODO callback implementation

    def finish(self):
        """write response"""
        self.frame_and_write_stream(self.message, self.id)
        self.message = CallResponseMessage()
