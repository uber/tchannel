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

import inspect
import tornado

from thrift.transport import TTransport
from thrift.protocol import TBinaryProtocol
from ..scheme import ThriftArgScheme
from ..tornado.stream import InMemStream
from ..tornado.broker import ArgSchemeBroker


def register(dispatcher, service_module, handler, service_name=None):
    """Registers the given service with the given dispatcher.

    .. code-block:: python

        # For,
        #
        #   service HelloWorld { string hello(1: string name); }

        import tchannel.thrift
        import HelloWorld

        class HelloWorldHandler(object):
            def hello(self, name):
                return "Hello, %s" % name

        dispatcher = TornadoDispatcher()
        tchannel.thrift.register(dispatcher, HelloWorld, HelloWorldHandler())

    :param dispatcher:
        TChannel dispatcher with which the Thrift service will be registered.
    :param service_module:
        The service module generated by Thrift. This module contains the
        service ``Iface``, ``Client``, ``Processor``, etc. classes.
    :param handler:
        An object implementing the service interface.
    :param service_name:
        Thrift service name. This is the `service` name specified in the
        Thrift IDL. If omitted, it is automatically determined based on the
        name of ``service_module``.
    """
    assert handler, "hanlder can't be None"
    assert dispatcher, "dispatcher can't be None"
    assert service_module, "service_module can't be None"

    if not service_name:
        service_name = service_module.__name__.rsplit('.', 1)[-1]

    methods = [
        name for (name, _) in inspect.getmembers(
            service_module.Iface, predicate=inspect.ismethod
        )
    ]

    for method in methods:
        endpoint = "%s::%s" % (service_name, method)
        dispatcher.register(
            endpoint,
            build_handler(service_module, method, handler),
            ArgSchemeBroker(ThriftArgScheme())
        )


def build_handler(service_module, method_name, handler):
    args_type = getattr(service_module, method_name + '_args')
    result_type = getattr(service_module, method_name + '_result')

    @tornado.gen.coroutine
    def thrift_handler(request, response, proxy):
        # TODO: Fix arg scheme passing
        # assert request.arg_scheme == 'thrift', (
        #     "Invalid arg scheme %s" % request.arg_scheme
        # )

        body = yield request.get_body()
        args = args_type()
        args.read(
            TBinaryProtocol.TBinaryProtocolAccelerated(
                TTransport.TMemoryBuffer(body)
            )
        )

        result = result_type()
        try:
            thrift_args = [
                getattr(args, spec[2]) for spec in args.thrift_spec[1:]]
            thrift_args.append(proxy)
            result.success = getattr(handler, method_name)(
                *thrift_args
            )
        except Exception as exc:
            for spec in result.thrift_spec[1:]:
                if isinstance(exc, spec[3][0]):
                    setattr(result, spec[2], exc)
                    break
            else:
                raise

        output_buf = TTransport.TMemoryBuffer()
        result.write(TBinaryProtocol.TBinaryProtocolAccelerated(output_buf))

        response.set_body_s(InMemStream(output_buf.getvalue()))

    return thrift_handler
