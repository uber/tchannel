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

from collections import namedtuple

from tornado import gen
from tornado import ioloop

from .. import glossary
from .. import tornado as async


class TChannelClient(object):
    """Implements a synchronous TChannel client.

    The client does not support receiving incoming connections and therefore,
    is not really bidirectional.

    The client is implemented on top of the Tornado-based implementation and
    starts and stops IOLoops on-demand.

    .. code-block:: python

        client = TChannelClient()
        response = client.request(
            hostport='localhost:4040',
            service='HelloService',
        ).send(
            'hello', None, json.dumps({"name": "World"})
        )

    """

    def __init__(self, process_name=None, io_loop=None):
        """Initialize a new TChannelClient.

        :param process_name:
            Name of the calling process. Used for logging purposes only.
        :param io_loop:
            Tornado IOLoop through which requests will be made.
        """
        self.io_loop = ioloop.IOLoop.current()
        self.async_client = async.TChannel(
            hostport=glossary.EPHEMERAL_HOSTPORT,
            process_name=process_name,
        )

    def request(self, *args, **kwargs):
        """Initiate a new request to a peer.

        :param hostport:
            If specified, requests will be sent to the specific host.
            Otherwise, a known peer will be picked at random.
        :param service:
            Name of the service being called. Defaults to an empty string.
        :param service_threshold:
            If ``hostport`` was not specified, this specifies the score
            threshold at or below which peers will be ignored.
        :returns:
            An object with a ``send(arg1, arg2, arg3)`` operation.
        """
        return ClientOperationWrapper(
            self.io_loop, self.async_client.request(*args, **kwargs)
        )


class ClientOperationWrapper(object):
    """Allows making client operation requests synchronously."""

    def __init__(self, io_loop, ops):
        assert io_loop, "io_loop is required"
        assert ops, "ops is required"

        self.io_loop = io_loop
        self.ops = ops

    def send(self, arg1, arg2, arg3):
        """Send the given triple over the wire.

        :param arg1:
            String containing the contents of arg1. If None, an empty string
            is used.
        :param arg2:
            String containing the contents of arg2. If None, an empty string
            is used.
        :param arg3:
            String containing the contents of arg3. If None, an empty string
            is used.
        :return:
            Response from the peer.
        """
        arg1 = arg1 or ''
        arg2 = arg2 or ''
        arg3 = arg3 or ''

        @gen.coroutine
        def go():
            # This is the response that contains argstreams. We need to read
            # everything in memory.
            resp = yield self.ops.send(arg1, arg2, arg3)

            resp_arg1 = yield resp.arg1()
            resp_arg2 = yield resp.arg2()
            resp_arg3 = yield resp.arg3()

            raise gen.Return(Response(resp_arg1, resp_arg2, resp_arg3))

        return self.io_loop.run_sync(go)


Response = namedtuple('Response', 'arg1, arg2, arg3')
