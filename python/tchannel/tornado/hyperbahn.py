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

import json

import tornado.gen

from ..messages.error import ErrorCode
from .tchannel import TChannel

DEFAULT_TTL = 60  # seconds


class HyperbahnClient(object):
    """Client for talking with the Hyperbahn."""

    def __init__(
        self,
        service,
        routers,
        tchannel=None
    ):
        """
        :param hostport:
            Address at which this service can be reached. For example,
            "127.0.0.1:2499".

        :param routers: list of hyperbahn addresses, e.g.,
            ``["127.0.0.1:21300", "127.0.0.1:21301"]``.

        :param tchannel: ``TChannel`` instance to make Hyperbahn requests with.
        """
        self.service = service
        self.tchannel = tchannel or TChannel()

        for known_peer in routers:
            self.tchannel.peers.add(known_peer)

    @tornado.gen.coroutine
    def request(
        self,
        service,
        endpoint,
        body=None,
        headers=None,
        protocol_headers=None,
    ):
        """Send a request to a service through Hyperbahn.

        Adds service name semantics and load balancing to regular TChannel
        request via a Hyperbahn routing mesh.

        :param service: name of service to make request to, eg "ncar".

        :param endpoint: endpoint to make request to, eg "find".

        :param body: body to send with request, eg JSON or Thrift.
        """

        request = self.tchannel.request(service=service)

        response = yield request.send(
            arg1=endpoint,
            arg2=headers,
            arg3=body,
            headers=protocol_headers,
        )

        raise tornado.gen.Return(response)

    @tornado.gen.coroutine
    def register(self, ioloop=None):
        """Register this service with the Hyperbahn routing mesh."""

        request_params = dict(
            service="hyperbahn",
            endpoint="ad",  # advertise
            body=json.dumps({
                "services": [
                    {
                        "serviceName": self.service,
                        "cost": 0,
                    },
                ],
            }),
            protocol_headers={
                "as": "json",
            },
        )

        # TODO: it would be nice to have message_type on the Response
        response = yield self.request(**request_params)

        if response.code not in ErrorCode:
            # re-register every ``DEFAULT_TTL`` seconds
            ioloop = tornado.ioloop.IOLoop.current()
            ioloop.call_later(
                delay=DEFAULT_TTL,
                callback=self.register,
            )
            raise tornado.gen.Return(response)

        raise NotImplementedError(response)
