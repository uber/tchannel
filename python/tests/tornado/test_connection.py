from __future__ import absolute_import

import pytest
import tornado.ioloop
import tornado.testing


def dummy_headers():
    return {
        'host_port': 'fake:1234',
        'process_name': 'honeybooboo',
    }


class ConnectionTestCase(tornado.testing.AsyncTestCase):
    @pytest.fixture(autouse=True)
    def make_server_client(self, tornado_pair):
        self.server, self.client = tornado_pair

    def get_new_ioloop(self):
        return tornado.ioloop.IOLoop.instance()

    @tornado.testing.gen_test
    def test_handshake(self):
        """Verify we handshake in an async manner."""
        headers = dummy_headers()

        yield self.client.initiate_handshake(headers=headers)
        yield self.server.await_handshake(headers=headers)
        yield self.client.await_handshake_reply()

        assert self.client.requested_version == self.server.requested_version

    @tornado.testing.gen_test
    def test_handle_calls(self):
        """Verify calls are sent to handler properly."""
        def _handle(data, connection):
            _, message = data
            # Not a rigorous assertion, but makes sure the data is well-formed.
            assert message.message_type

        yield self.client.ping()
        yield self.server.handle_calls(_handle)
