from __future__ import absolute_import

import pytest
import tornado.ioloop
import tornado.iostream
import tornado.testing


class TestIOStreamFrameReader(tornado.testing.AsyncTestCase):
    @pytest.fixture(autouse=True)
    def make_server_client(self, tornado_pair):
        self.server, self.client = tornado_pair

    def get_new_ioloop(self):
        return tornado.ioloop.IOLoop.instance()

    @tornado.testing.gen_test
    def test_read_closed(self):
        """Verify we ignore closed streams."""
        self.client._connection._stream.close()

        response = yield self.server.reader.read()
        assert response is None
