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

from .messages import CallResponseMessage
from .messages.error import ErrorCode

from .handler import BaseRequestHandler

Endpoint = collections.namedtuple('Endpoint', ['handler', 'opts'])


class RequestDispatcher(BaseRequestHandler):
    """A synchronous RequestHandler that dispatches calls to different
    endpoints based on ``arg1``.

    Endpoints are registered using ``register`` or the ``route``
    decorator.

    .. code-block:: python

        handler = # ...

        @hanlder.route('myMethod')
        def myMethod(request, response, opts):
            response.write('hello world')
    """

    def __init__(self):
        super(RequestDispatcher, self).__init__()
        self.endpoints = {}

    def _call_endpoint(self, endpoint, request, response):
        try:
            endpoint.handler(request, response, endpoint.opts)
        finally:
            response.finish()

    def handle_call(self, message_id, call, connection):
        request = Request(message_id, call, connection)
        endpoint = self.endpoints.get(request.endpoint, None)

        if endpoint is None:
            return connection.send_error(
                ErrorCode.bad_request,
                "Endpoint '%s' for service '%s' is not defined" % (
                    call.args[0], call.service
                ),
                message_id,
            )

        response = Response(message_id, connection)
        return self._call_endpoint(endpoint, request, response)

    def route(self, rule, **opts):
        def decorator(handler):
            self.register(rule, handler, **opts)
            return handler

        return decorator

    def register(self, rule, handler, **opts):
        """Register a new endpoint with the given name.

        .. code-block:: python

            def handler(request, response, opts):
                print opts  # => {'foo': 'bar'}
                # ...

            handler.register('is_healthy', handler, foo='bar')

        :param rule:
            Name of the endpoint. Incoming Call Requests must have this as
            ``arg1`` to dispatch to this handler.
        :param handler:
            A function that gets called with ``Request``, ``Response``, and
            the ``opts`` dictionary.
        :param opts:
            Parameters to pass to the ``handler`` as a dictionary.
        """
        self.endpoints[rule] = Endpoint(handler=handler, opts=opts)


class Request(object):
    """Represents an incoming request to an endpoint."""

    __slots__ = ('message', 'header', 'body', 'endpoint', 'id', 'connection')

    def __init__(self, message_id, message, connection):
        assert len(message.args) == 3

        self.id = message_id
        self.message = message
        self.connection = connection

        self.endpoint = self.message.args[0]
        self.header = self.message.args[1]
        self.body = self.message.args[2]


class Response(object):
    """An outgoing response.

    Handlers will set either ``write`` or manually set the ``message`` to
    specify the response message.
    """

    __slots__ = ('connection', 'message', 'id', 'arg1', 'arg2', 'arg3')

    def __init__(self, message_id, connection):
        self.id = message_id
        self.connection = connection

        self.arg1 = ""
        self.arg2 = ""
        self.arg3 = ""

        self.message = None

    def write(self, arg1="", arg2="", arg3=""):
        """Write the given args to the response."""
        self.arg1 += arg1
        self.arg2 += arg2
        self.arg3 += arg3

    def finish(self):
        """Finish writing the response."""
        # TODO failure codes

        if self.message is None:
            self.message = CallResponseMessage(
                args=[self.arg1, self.arg2, self.arg3]
            )

        return self.connection.frame_and_write_stream(self.message, self.id)
