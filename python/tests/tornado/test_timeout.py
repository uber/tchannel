from __future__ import absolute_import

import pytest
import tornado.gen
import tornado.ioloop
import tornado.testing

from tchannel.tornado.timeout import timeout


class TimeoutTestCase(tornado.testing.AsyncTestCase):

    @pytest.fixture(autouse=True)
    def make_server_client(self, tornado_pair):
        self.server, self.client = tornado_pair

    def get_new_ioloop(self):
        return tornado.ioloop.IOLoop.instance()

    @tornado.testing.gen_test
    def test_server_timeout(self):
        with timeout(self.client, seconds=0.001):
            future = self.client.initiate_handshake(headers={})
            yield tornado.gen.sleep(0.001)
            yield future

        assert self.client.closed
