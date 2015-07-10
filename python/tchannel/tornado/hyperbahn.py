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
import logging

import tornado.gen
import tornado.ioloop

from ..messages.error import ErrorCode

DEFAULT_TTL = 60  # seconds


log = logging.getLogger('tchannel')


def advertise(tchannel, service, routers):
    """Advertise the given TChannel to Hyperbahn using the given name.

    This informs Hyperbahn that the given service is hosted at this TChannel
    at a fixed rate.

    It also tells the TChannel about the given Hyperbahn routers.

    :param tchannel:
        TChannel to register with Hyperbahn
    :param service:
        Name of the service behind this TChannel
    :param routers:
        Seed list of addresses of Hyperbahn routers
    :returns:
        A future that resolves to the remote server's response after the first
        advertise finishes.
    """

    for router in routers:
        # We use .get here instead of .add because we don't want to fail if a
        # TChannel already knows about some of the routers.
        tchannel.peers.get(router)

    @tornado.gen.coroutine
    def _register():
        response = yield tchannel.request(service='hyperbahn').send(
            arg1='ad',  # advertise
            arg2='',
            arg3=json.dumps({
                'services': [
                    {
                        'serviceName': service,
                        'cost': 0,
                    }
                ]
            }),
            headers={'as': 'json'},
        )
        if response.code not in ErrorCode:
            # re-register every ``DEFAULT_TTL`` seconds
            tornado.ioloop.IOLoop.current().call_later(
                delay=DEFAULT_TTL,
                callback=_register,
            )
            raise tornado.gen.Return(response)
        else:
            log.error('Failed to register with Hyperbahn: %s', response)
            raise NotImplementedError  # TODO figure out behavior here

    return _register()


advertize = advertise  # just in case
