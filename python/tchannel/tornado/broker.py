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

from ..errors import InvalidEndpointError
from ..errors import InvalidMessageError
from ..errors import TChannelError
from ..scheme import RawArgScheme
from .stream import Stream


class ArgSchemeBroker(object):
    """Use serializer to broker request/response."""

    def __init__(self, arg_scheme=None):
        self.endpoint = {}
        self.arg_scheme = arg_scheme or RawArgScheme()

    def register(self, rule, handler):
        """Register handler.

        :param rule: endpoint
        :param handler: endpoint handler
        """
        self.endpoint[rule] = handler

    def handle_call(self, req, resp, proxy):
        if req.headers.get('as', None) != self.arg_scheme.type():
            raise InvalidMessageError(
                "Invalid arg scheme in request header"
            )

        req.scheme = self.arg_scheme
        resp.scheme = self.arg_scheme

        handler = self.endpoint.get(req.endpoint, None)
        if handler is None:
            raise InvalidEndpointError(
                "Endpoint '%s' for service '%s' is not defined" % (
                    req.endpoint, req.service
                )
            )

        return handler(req, resp, proxy)

    @tornado.gen.coroutine
    def send(self, client, endpoint, header, body, traceflag=False):
        try:
            if not isinstance(header, Stream):
                raw_header = self.arg_scheme.serialize_header(header)
            else:
                raw_header = header

            if not isinstance(body, Stream):
                raw_body = self.arg_scheme.serialize_body(body)
            else:
                raw_body = body

        except Exception as e:
            raise TChannelError(e.message)

        resp = yield client.send(
            arg1=endpoint,
            arg2=raw_header,
            arg3=raw_body,
            traceflag=traceflag,
            headers={'as': self.arg_scheme.type()},
        )

        resp.scheme = self.arg_scheme

        raise tornado.gen.Return(resp)
