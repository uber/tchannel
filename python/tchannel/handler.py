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

import collections
from .messages import CallResponseMessage
from .messages import PingRequestMessage
from .messages import PingResponseMessage
from .messages.error import ErrorCode

Endpoint = collections.namedtuple('Endpoint', ['handler', 'opts'])


class RequestHandler(object):
    """Base class for request handlers.

    Usage example:
        class CustomerReqHandler(RequestHandler):
            def handle_request(self, context, conn):
                Add customized request handling
                logic here

    """
    def handle_request(self, context, conn):
        """Handle incoming request

        :param context: context contains received CallRequestMessage
        :param conn: An incoming TornadoConnection
        """
        raise NotImplementedError()


class TChannelRequestHandler(RequestHandler):
    def __init__(self):
        super(TChannelRequestHandler, self).__init__()
        self.endpoints = {}

    def handle_request(self, context, conn):
        """dispatch incoming request to particular endpoint

        :param context: context contains received CallRequestMessage
        :param conn: An incoming TornadoConnection
        """
        # TODO: stop passing conn around everywhere
        request = TChannelRequest(context, conn)
        endpoint = self._find_endpoint(request.method)
        if endpoint is not None:
            response = TChannelResponse(request, conn)
            try:
                endpoint.handler(request, response, endpoint.opts)
            # TODO add tchannel error handling here
            finally:
                response.finish()

        elif context.message.message_type == PingRequestMessage.message_type:
            response = TChannelResponse(request, conn)
            response.resp_msg = PingResponseMessage()
            response.finish()

        else:
            msg = "no such endpoint service={0} endpoint={1}".format(
                context.message.service, context.message.arg_1)
            conn.send_error(ErrorCode.bad_request, msg, context.message_id)

    def route(self, rule, **opts):
        def decorator(handler):
            self.register_handler(rule, handler, **opts)
            return handler

        return decorator

    def register_handler(self, rule, handler, **opts):
        self.endpoints[rule] = Endpoint(handler=handler, opts=opts)

    def _find_endpoint(self, rule):
        return self.endpoints.get(rule, None)


class TChannelRequest(object):
    """TChannel Request Wrapper"""

    __slots__ = ('message', 'header',
                 'body', 'method',
                 'connection', 'context',
                 'id')

    def __init__(self, context, conn):
        self.message = context.message

        try:
            self.method = self.message.args[0]
            self.header = self.message.args[1]
            self.body = self.message.args[2]
        except:
            pass

        self.connection = conn
        self.context = context
        self.id = context.message_id

        # TODO fill up more attributes


class TChannelResponse(object):
    """TChannel Response Wrapper"""

    __slots__ = ('_connection', '_request',
                 'resp_msg', 'id', 'body',
                 'headers')

    def __init__(self, request, conn):
        self._connection = conn
        self._request = request
        self.body = ""
        self.headers = ""
        self.id = request.id
        self.resp_msg = None

    def write(self, chunk):
        # build response message
        self.body += chunk

    def finish(self):
        # TODO add status code into arg_1 area
        self.resp_msg = CallResponseMessage(
            args=["", self.headers, self.body]
        )
        self._connection.finish(self)

    def update_resp_id(self):
        self.id += 1
