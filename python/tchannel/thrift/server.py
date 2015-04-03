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

from ..handler import RequestHandler

# Ignore this file for now. This is just a placeholder to add all the
# server-side support.


def processor(thrift_module, implementation_class, exception_logger=None):
    # TODO probably lift from clay_thrift/common.py
    raise NotImplementedError()


class ThriftDispatcher(RequestHandler):
    """A RequestHandler that delegates calls to a Thrift processor.

    .. code-block::

        dispatcher = ThriftDispatcher()

        dispatcher.register(
            "UserService",
            processor(
                blog_service.thrift.service.UserService,
                UserServiceHandler,
            ),
        )

        dispatcher.register(
            "PostService",
            processor(
                blog_service.thrift.service.PostService,
                PostServiceHandler,
            )
        )


    """

    __slots__ = ('services',)

    def __init__(self):
        super(ThriftDispatcher, self).__init__()
        self.services = {}

    def register(self, service_name, processor):
        self.services[service_name] = processor

    def handle(self, context, connection):
        raise NotImplementedError()
