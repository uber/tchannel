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

import pytest
import tornado.ioloop
import tornado.testing

from tchannel.messages import Types


def dummy_headers():
    return {
        'host_port': 'fake:1234',
        'process_name': 'honeybooboo',
    }


class ConnectionTestCase(tornado.testing.AsyncTestCase):
    @pytest.fixture(autouse=True)
    def make_server_client(self, tornado_pair):
        self.server, self.client = tornado_pair

    @tornado.testing.gen_test
    def test_handshake(self):
        """Verify we handshake in an async manner."""
        headers = dummy_headers()

        self.client.initiate_handshake(headers=headers)
        yield self.server.expect_handshake(headers=headers)

        assert self.client.requested_version == self.server.requested_version

    @tornado.testing.gen_test
    def test_pings(self):
        """Verify calls are sent to handler properly."""
        self.client.ping()

        ping = yield self.server.await()
        assert ping.message_type == Types.PING_REQ

        self.server.pong()

        pong = yield self.client.await()
        assert pong.message_type == Types.PING_RES
