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

import tornado
import tornado.gen
from tornado import gen

from ..event import EventType
from ..handler import BaseRequestHandler
from ..messages.error import ErrorCode
from .broker import ArgSchemeBroker
from .data import Response


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
        self.default_broker = ArgSchemeBroker()
        self.endpoints = {}

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
        if connection.tchannel:
            request.tracing.name = request.endpoint
            connection.tchannel.event_emitter.fire(
                EventType.before_receive_request,
                request,
            )

        endpoint = self.endpoints.get(request.endpoint, None)
        if endpoint is None:
            connection.send_error(
                ErrorCode.bad_request,
                "Endpoint '%s' for service '%s' is not defined" % (
                    request.endpoint, request.service),
                request.id)
        else:
            response = Response(
                id=request.id,
                checksum=request.checksum,
                tracing=request.tracing,
                connection=connection,
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
            except Exception as e:
                # refine the exception in the following patches
                if response.flushed:
                    # this is bad if user called flush before exception happens
                    return
                # TODO send internal error


    def route(self, rule, helper=None):
        """See ``register`` for documentation."""

        def decorator(handler):
            self.register(rule, handler, helper)
            return handler

        return decorator

    def register(self, rule, handler, broker=None):
        """Register a new endpoint with the given name.

        .. code-block:: python

            def handler(request, response, proxy):
                proxy.request(serviceName).send(...) # send outgoing request
                # ...

            handler.register('is_healthy', handler, foo='bar')

        :param rule:
            Name of the endpoint. Incoming Call Requests must have this as
            ``arg1`` to dispatch to this handler.
        :param handler:
            A function that gets called with ``Request``, ``Response``, and
            the ``proxy``.
        :param broker:
            Broker injects customized serializer and deserializer into
            request/response object.

            broker==None means it registers as raw handle. It deals with raw
            buffer in the request/response.
        """
        assert rule, "rule must not be None"
        assert handler, "handler must not be None"
        if not broker:
            broker = self.default_broker

        broker.register(rule, handler)
        self.endpoints[rule] = broker.handle_call


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

    def host(self, handler):
        return self._tchannel.host(handler)

    def listen(self):
        return self._tchannel.listen()

    def request(self, hostport=None, service=None, **kwargs):
        kwargs['parent_tracing'] = self.parent_tracing
        return self._tchannel.request(hostport,
                                      service,
                                      **kwargs)
