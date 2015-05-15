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
from collections import namedtuple

from tornado import gen
from thrift import Thrift

from .scheme import ThriftArgScheme
from tchannel.tornado.broker import ArgSchemeBroker

# Generated clients will use this base class.
_ClientBase = namedtuple('_ClientBase', 'tchannel hostport service')


def client_for(service, service_module, thrift_service_name=None):
    """Build a client class for the given Thrift service.

    The generated class accepts a TChannel and an optional hostport as
    initialization arguments.

    Given ``CommentService`` defined in ``comment.thrift`` and registered with
    Hyperbahn under the name "comment", here's how this may be used:

    .. code-block:: python

        from comment import CommentService

        CommentServiceClient = client_for("comment", CommentService)

        @gen.coroutine
        def post_comment(articleId, msg, hostport=None):
            client = CommentServiceClient(tchannel, hostport)
            yield client.postComment(articleId, CommentService.Comment(msg))

    :param service:
        Name of the Hyperbahn service being called. This is the name with
        which the service registered with Hyperbahn.
    :param service_module:
        The Thrift-generated module for that service. This usually has the
        same name as defined for the service in the IDL.
    :param thrift_service_name:
        If the Thrift service has a different name than its module, use this
        parameter to specify it.
    :returns:
        An object with the same interface as the service that uses the given
        TChannel to call the service.
    """
    assert service_module, 'service_module is required'
    service = service or ''  # may be blank for non-hyperbahn use cases
    if not thrift_service_name:
        thrift_service_name = service_module.__name__.rsplit('.', 1)[-1]

    method_names = [
        name for (name, _) in inspect.getmembers(
            service_module.Iface, predicate=inspect.ismethod
        )
    ]

    def new(cls, tchannel, hostport=None):
        """
        :param tchannel:
            TChannel through which the requests will be sent.
        :param hostport:
            Address of the machine to which the requests will be sent, or None
            if the TChannel will do peer selection on a per-request basis.
        """
        return _ClientBase.__new__(cls, tchannel, hostport, service)

    new.__name__ = '__new__'
    methods = {'__new__': new}

    for method_name in method_names:
        methods[method_name] = generate_method(
            service_module, thrift_service_name, method_name
        )

    return type(thrift_service_name + 'Client', (_ClientBase,), methods)


def generate_method(service_module, service_name, method_name):
    """Generate a method for the given Thrift service.

    :param service_module:
        Thrift-generated service module
    :param service_name:
        Name of the Thrift service
    :param method_name:
        Method being called
    """
    assert service_module
    assert service_name
    assert method_name

    args_type = getattr(service_module, method_name + '_args')
    result_type = getattr(service_module, method_name + '_result')
    # TODO result_type is None when the method is oneway.
    # We don't support oneway yet.

    arg_scheme = ThriftArgScheme(result_type)
    result_spec = result_type.thrift_spec
    # result_spec is a tuple of tuples in the form:
    #
    #   (fieldId, fieldType, fieldName, ...)
    #
    # Where "..." is other information we don't care about right now.
    #
    # result_spec will be empty if there is no return value or exception for
    # the method.
    #
    # Its first element, with field ID 0, contains the spec for the return
    # value. It is None if the result type is void but the method may still
    # throw exceptions.
    #
    # Elements after the first one are specs for the exceptions.

    endpoint = '%s::%s' % (service_name, method_name)

    @gen.coroutine
    def send(self, *args, **kwargs):
        params = inspect.getcallargs(
            getattr(service_module.Iface, method_name), self, *args, **kwargs
        )
        params.pop('self')  # self is already known

        # $methodName_args is the implicit struct containing the various
        # method parameters.
        call_args = args_type()
        for name, value in params.items():
            setattr(call_args, name, value)

        response = yield ArgSchemeBroker(arg_scheme).send(
            self.tchannel.request(
                hostport=self.hostport, service=self.service
            ),
            endpoint,
            {},  # TODO: Figure out how to receive headers for the call
            call_args,
        )

        call_result = yield response.get_body()
        if not result_spec:
            # void return type and no exceptions allowed
            raise gen.Return(None)

        for exc_spec in result_spec[1:]:
            # May have failed with an exception
            exc = getattr(call_result, exc_spec[2])
            if exc is not None:
                raise exc

        if result_spec[0]:
            # Non-void return type. Return the result.
            success = getattr(call_result, result_spec[0][2])
            if success is not None:
                raise gen.Return(success)
        else:
            # No return type specified and no exceptions raised.
            raise gen.Return(None)

        # Expected a result but nothing was present in the object. Something
        # went wrong.
        raise Thrift.TApplicationException(
            Thrift.TApplicationException.MISSING_RESULT,
            '%s failed: did not receive a result as expected' % method_name
        )
        # TODO: We should probably throw a custom exception instead.

    send.__name__ = method_name
    return send
