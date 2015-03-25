import json
from .connection import TornadoConnection
from ..messages import CallResponseMessage


class TornadoHttpConnection(TornadoConnection):
    def __init__(self, connection, context):
        super(TornadoHttpConnection, self).__init__(connection)
        self.context = context
        self.resp_msg = CallResponseMessage()
        self.id = context.message_id

    def write_headers(self, start_line, headers, chunk=None, callback=None):
        self.resp_msg.arg_2 = json.dumps(headers) if headers else ''

    def write(self, chunk, callback=None):
        self.resp_msg.arg_3 += chunk
        # TODO callback implementation

    def finish(self):
        """write response"""
        self.frame_and_write(self.resp_msg, self.id)
        self.resp_msg = CallResponseMessage()

    def update_resp_id(self):
        self.id += 1
