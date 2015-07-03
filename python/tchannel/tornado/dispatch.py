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

from collections import defaultdict

import tornado
import tornado.gen
from tornado import gen

from ..errors import InvalidEndpointError
from ..errors import InvalidMessageError
from ..errors import TChannelError
from ..event import EventType
from ..handler import BaseRequestHandler
from ..messages.error import ErrorCode
from .broker import ArgSchemeBroker
from .response import Response


class RequestDispatcher(BaseRequestHandler):
    """A synchronous RequestHandler that dispatches calls to different
    endpoints based on ``arg1``.

    Endpoints are registered using ``register`` or the ``route``
    decorator.

    .. code-block:: python

        handler = # ...

        @handler.route('my_method')
        def my_method(request, response, proxy):
            response.write('hello world')
    """

    FALLBACK = object()

    def __init__(self):
        super(RequestDispatcher, self).__init__()
        self.default_broker = ArgSchemeBroker()
        self.endpoints = defaultdict(lambda: self.not_found)

    @tornado.gen.coroutine
    def handle_call(self, request, connection):
        # read arg_1 so that handle_call is able to get the endpoint
        # name and find the endpoint handler.
        # the arg_1 value will be store in the request.endpoint field.

        # NOTE: after here, the correct way to access value of arg_1 is through
        # request.endpoint. The original argstream[0] is no longer valid. If
        # user still tries read from it, it will return empty.
        chunk = yield request.argstreams[0].read()

        while chunk:
            request.endpoint += chunk
            chunk = yield request.argstreams[0].read()

        # event: receive_request
        request.tracing.name = request.endpoint

        connection.tchannel.event_emitter.fire(
            EventType.before_receive_request,
            request,
        )

        endpoint = self.endpoints[request.endpoint]

        response = Response(
            id=request.id,
            checksum=request.checksum,
            tracing=request.tracing,
            connection=connection,
            headers={'as': request.headers.get('as', 'raw')},
        )

        connection.post_response(response)

        try:
            yield gen.maybe_future(
                endpoint(
                    request,
                    response,
                    TChannelProxy(
                        connection.tchannel,
                        request.tracing,
                    ),
                )
            )
            response.flush()
        except (InvalidMessageError, InvalidEndpointError) as e:
            response.set_exception(e)
            connection.request_message_factory.remove_buffer(response.id)
            connection.send_error(
                ErrorCode.bad_request,
                e.message,
                response.id,
            )
        except Exception as e:
            response.set_exception(TChannelError(e.message))
            connection.request_message_factory.remove_buffer(response.id)
            connection.send_error(
                ErrorCode.unexpected,
                "An unexpected error has occurred from the handler",
                response.id,
            )

        raise gen.Return(response)

    def route(self, rule, helper=None):
        """See ``register`` for documentation."""

        def decorator(handler):
            self.register(rule, handler, helper)
            return handler

        return decorator

    def register(self, rule, handler, broker=None):
        """Register a new endpoint with the given name.

        .. code-block:: python

            @dispatcher.register('is_healthy')
            def check_health(request, response, proxy):
                # ...

        :param rule:
            Name of the endpoint. Incoming Call Requests must have this as
            ``arg1`` to dispatch to this handler.

            If ``RequestHandler.FALLBACK`` is specified as a rule, the given
            handler will be used as the 'fallback' handler when requests don't
            match any registered rules.

        :param handler:
            A function that gets called with ``Request``, ``Response``, and
            the ``proxy``.

        :param broker:
            Broker injects customized serializer and deserializer into
            request/response object.

            broker==None means it registers as raw handle. It deals with raw
            buffer in the request/response.
        """
        assert handler, "handler must not be None"

        # TODO: Get rid of this Broker thing!! It has the same interface as the
        # Dispatcher but only handles serialization.
        if not broker:
            broker = self.default_broker

        if rule is self.FALLBACK:
            self.endpoints.default_factory = lambda: handler
            return

        broker.register(rule, handler)

        self.endpoints[rule] = broker.handle_call

    @staticmethod
    def not_found(request, response, proxy):
        """Default behavior for requests to unrecognized endpoints."""
        raise InvalidEndpointError(
            "Endpoint '%s' for service '%s' is not defined" % (
                request.endpoint,
                request.service,
            ),
        )


class TChannelProxy(object):
    """TChannel Proxy with additional runtime info

    TChannelProxy contains parent_tracing information which is created by
    received request.

    TChannelProxy will be used as one parameter for the request handler.

    Example::

        def handler(request, response, proxy):

    """
    __slots__ = ('_tchannel', 'parent_tracing')

    def __init__(self, tchannel, parent_tracing=None):
        self._tchannel = tchannel
        self.parent_tracing = parent_tracing

    @property
    def closed(self):
        return self._tchannel.closed

    @property
    def hostport(self):
        return self._tchannel.hostport

    def request(self, hostport=None, service=None, **kwargs):
        kwargs['parent_tracing'] = self.parent_tracing
        return self._tchannel.request(hostport,
                                      service,
                                      **kwargs)
