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
import random
import tornado.gen

from .messages.error import ErrorCode
from .tornado.tchannel import TChannel


DEFAULT_TTL = 60  # seconds


class HyperbahnRegistrant(object):
    """Register a service with a Hyperbahn routing mesh."""

    def __init__(self, hyperbahn_client, service):
        """
        :param hyperbahn_client: ``HyperbahnClient`` to make ``register``
            requests with.

        :param service: Name of service to register with Hyperbahn, eg "maps".
        """
        self.hyperbahn_client = hyperbahn_client
        self.service = service

    @tornado.gen.coroutine
    def register(self):
        """Enable register heartbeat, adding service to the Hyperbahn."""

        forward_request = dict(
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
        response = yield self.hyperbahn_client.request(**forward_request)

        if response.code not in ErrorCode:
            # re-register every ``DEFAULT_TTL`` seconds
            ioloop = tornado.ioloop.IOLoop.current()
            ioloop.call_later(
                delay=DEFAULT_TTL,
                callback=self.register,
            )
            return

        raise NotImplementedError(response)


class HyperbahnClient(object):
    """Client for talking with the Hyperbahn."""

    def __init__(
        self,
        hyperbahn_routers,
        tchannel=None
    ):
        """
        :param hyperbahn_routers: list of hyperbahn addresses, e.g.,
            ``["127.0.0.1:21300", "127.0.0.1:21301"]``.

        :param tchannel: ``TChannel`` instance to make Hyperbahn requests with.
        """
        self.hyperbahn_routers = hyperbahn_routers

        self.tchannel = tchannel or TChannel()

    @tornado.gen.coroutine
    def request(self, service, endpoint, body=None, headers=None, protocol_headers=None):
        """Send a request to a service through Hyperbahn.

        Adds service name semantics and load balancing to regular TChannel
        request via a Hyperbahn routing mesh.

        :param service: name of service to make request to, eg "ncar".

        :param endpoint: endpoint to make request to, eg "find".

        :param body: body to send with request, eg JSON or Thrift.
        """
        host = self._get_hyperbahn_router()

        request = self.tchannel.request(
            hostport=host,
            service=service,
        )

        response = yield request.send(
            arg1=endpoint,
            arg2=headers,
            arg3=body,
            headers=protocol_headers,
        )

        raise tornado.gen.Return(response)

    def _get_hyperbahn_router(self):
        """Retrieve a random Hyperbahn host from ``self.hyperbahn_routers``."""
        return random.choice(self.hyperbahn_routers)

    def register(self, service):
        """Enable register heartbeat, adding service to the Hyperbahn.

        :param service: name of service to register with Hyperbahn, eg "maps"
        """
        registrant = HyperbahnRegistrant(
            hyperbahn_client=self,
            service=service,
        )
        return registrant.register()
