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
    """Specifies how a TChannel server handles incoming requests.

    This class is agnostic of whether specific implementations are synchronous
    or Tornado-based.
    """

    def handle(self, context, connection):
        """Handle an incoming request.

        The handshake has already been completed.

        :param context:
            Context containing the incoming message.
        :param connection:
            Reference to the connection object
        :returns:
            Nothing. The connection object must be used to send the response
            back.
        """
        raise NotImplementedError()


class BaseRequestHandler(RequestHandler):
    """A minimal RequestHandler skeleton.

    This implements a minimal base RequestHandler that implements methods
    which should be mostly the same between implementations. Implementations
    must inherit this class and override at least ``handle_call``.
    """

    _HANDLER_NAMES = {
        Types.PING_REQ: 'ping',
        Types.CALL_REQ: 'call'
    }

    def __init__(self):
        super(BaseRequestHandler, self).__init__()

    def handle(self, context, connection):
        # TODO assert that the handshake was already completed
        assert context, "context must not be None"

        message_id = context.message_id
        message = context.message

        if message.message_type not in self._HANDLER_NAMES:
            # TODO handle this more gracefully
            raise NotImplementedError("Unexpected message: %s" % str(context))

        handler_name = "handle_" + self._HANDLER_NAMES[message.message_type]
        return getattr(self, handler_name)(message_id, message, connection)

    def handle_ping(self, message_id, ping, connection):
        return connection.frame_and_write(PingResponseMessage(), message_id)

    def handle_call(self, message_id, call, connection):
        """Handle an incoming call.

        :param message_id:
            Message ID of the request
        :param call:
            CallRequestMessage containing information about the call
        :param connection:
            Connection through which the call was made
        :returns:
            Nothing. The response must be sent using the
            implementation-specific connection object.
        """
        raise NotImplementedError("Must be implemented.")


class TChannelRequestHandler(BaseRequestHandler):
    """A RequestHandler that dispatches to different endpoints.

    Endpoints are registered using ``register`` or the ``route``
    decorator.

    .. code-block:: python

        handler = # ...

        @hanlder.route('myMethod')
        def myMethod(request, response, opts):
            response.write('hello world')
    """

    def __init__(self):
        super(TChannelRequestHandler, self).__init__()
        self.endpoints = {}

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
