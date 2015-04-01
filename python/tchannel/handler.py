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

import collections

import tornado

from .messages import CallResponseMessage
from .messages import Types
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
        if context.message.message_type == Types.PING_REQ:
            return conn.frame_and_write(
                PingResponseMessage(),
                context.message_id,
            )

        if context.message.message_type == Types.CALL_REQ:
            request = TChannelRequest(context, conn)
            endpoint = self._find_endpoint(getattr(request, 'endpoint', None))
            if endpoint is not None:
                response = TChannelResponse(context, conn)
                result = None
                try:
                    result = endpoint.handler(request, response, endpoint.opts)
                    if isinstance(result, tornado.gen.Future):
                        result.add_done_callback(lambda f: response.finish())
                        tornado.ioloop.IOLoop.current().add_future(
                            result,
                            lambda f: f.exception()
                        )
                    return result
                # TODO add tchannel error handling here
                finally:
                    if result is None:
                        response.finish()
            else:
                msg = "no such endpoint service={0} endpoint={1}".format(
                    context.message.service, context.message.args[0])
                return conn.send_error(ErrorCode.bad_request, msg, context.message_id)

        # TODO handle other type message
        raise NotImplementedError()

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
                 'body', 'endpoint',
                 'connection', 'context',
                 'id')

    def __init__(self, context, conn):
        self.message = context.message

        assert len(getattr(self.message, "args", [])) == 3

        self.endpoint = self.message.args[0]
        self.header = self.message.args[1]
        self.body = self.message.args[2]

        self.connection = conn
        self.context = context
        self.id = context.message_id

        # TODO fill up more attributes


class TChannelResponse(object):
    """TChannel Response Wrapper"""

    __slots__ = ('_connection',
                 'resp_msg', 'id',
                 'arg1', 'arg2', 'arg3',
                 'headers')

    def __init__(self, context, conn):
        self._connection = conn
        self.arg1 = ""
        self.arg2 = ""
        self.arg3 = ""
        self.id = context.message_id
        self.resp_msg = None

    def write(self, arg1="", arg2="", arg3=""):
        # build response message
        self.arg1 += arg1
        self.arg2 += arg2
        self.arg3 += arg3

    def finish(self):
        # TODO add status code into arg_1 area
        if self.resp_msg is None:
            self.resp_msg = CallResponseMessage(
                args=[self.arg1, self.arg2, self.arg3]
            )
        self._connection.finish(self)
        self.resp_msg = None

    def update_resp_id(self):
        self.id += 1
