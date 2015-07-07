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

from tchannel.thrift.client import client_for as async_client_for


def client_for(service, service_module, thrift_service_name=None):
    """Build a synchronous client class for the given Thrift service.

    The generated class accepts a TChannelSyncClient and an optional
    hostport as initialization arguments.

    Given ``CommentService`` defined in ``comment.thrift`` and registered
    with Hyperbahn under the name "comment", here's how this might be used:

    .. code-block:: python

        from tchannel.sync import TChannelSyncClient
        from tchannel.sync.thrift import client_for

        from comment import CommentService

        CommentServiceClient = client_for('comment', CommentService)

        tchannel_sync = TChannelSyncClient('my-service')
        comment_client = CommentServiceClient(tchannel_sync)

        future = comment_client.postComment(
            articleId,
            CommentService.Comment("hi")
        )
        result = future.result()

    :param service:
        Name of the Hyperbahn service being called.
    :param service_module:
        The Thrift-generated module for that service. This usually has
        the same name as definied for the service in the IDL.
    :param thrift_service_name:
        If the Thrift service has a different name than its module, use
        this parameter to specify it.
    :returns:
        An Thrift-like class, ready to be instantiated and used
        with TChannelSyncClient.
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

    def init(self, tchannel_sync, hostport=None, trace=False):
        self.async_thrift = self.__async_client_class__(
            tchannel_sync.async_client,
            hostport,
            trace,
        )
        self.threadloop = tchannel_sync.threadloop

    init.__name__ = '__init__'
    methods = {
        '__init__': init,
        '__async_client_class__': async_client_for(
            service,
            service_module,
            thrift_service_name,
        )
    }

    methods.update({
        method_name: generate_method(method_name)
        for method_name in method_names
    })

    return type(thrift_service_name + 'Client', (object,), methods)


def generate_method(method_name):
    """Generate a method for a given Thrift service.

    Uses the provided TChannelSyncClient's threadloop in order
    to convert RPC calls to concurrent.futures

    :param method_name: Method being called.
    :return: A method that invokes the RPC using TChannelSyncClient
    """

    def send(self, *args, **kwargs):
        """Forward RPC call to TChannelSyncClient

        :return concurrent.futures.Future:
        """
        return self.threadloop.submit(
            getattr(self.async_thrift, method_name), *args, **kwargs
        )

    return send
