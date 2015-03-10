from __future__ import absolute_import

import socket
import threading
try:
    import SocketServer
except ImportError:
    import socketserver as SocketServer
from contextlib import contextmanager

import pytest

import tchannel.socket as tchannel
import tchannel.messages as tmessage


@pytest.fixture
def random_open_port():
    """Find and return a random open TCP port."""
    sock = socket.socket(socket.AF_INET)
    try:
        sock.bind(('', 0))
        return sock.getsockname()[1]
    finally:
        sock.close()


class Expectation(object):
    """Represents an expectation for the ServerManager."""
    def __init__(self, matcher):
        assert matcher is not None

        # expectation.matches(req) accepts a Message and returns True or
        # False.
        self.matches = matcher

        # expectation.respond(context, connection) accepts the context and the
        # connection and writes output to the connection.
        self._respond = None

    @classmethod
    def messageType(cls, msg_typ):
        """Build an expectation that expects a mesasge with the given type."""
        return cls(lambda msg: msg.message_type == msg_typ)

    @property
    def respond(self):
        # Do nothing if an action setter wasn't called.
        if self._respond:
            return self._respond
        else:
            return (lambda ctx, conn: None)

    def and_return(self, resp):
        """Write the given Message as a response."""
        def respond(ctx, conn):
            return conn.frame_and_write(resp)
        self._respond = respond


class ServerManager(object):
    """Provides a dynamically configurable TChannel server."""
    TIMEOUT = 0.15

    def __init__(self, port, timeout=None):
        manager = self
        self.port = port
        self.timeout = timeout or self.TIMEOUT

        class Handler(SocketServer.BaseRequestHandler):
            def setup(self):
                self.request.settimeout(manager.timeout)
                self.tchan_conn = tchannel.SocketConnection(self.request)

            def handle(self):
                (host, port) = self.request.getsockname()
                self.tchan_conn.await_handshake(headers={
                    'host_port': '%s:%s' % (host, port),
                    'process_name': 'tchannel_server-%s' % port
                })
                self.tchan_conn.handle_calls(manager.handle_call)

        self.server = SocketServer.TCPServer(("", port), Handler)
        self.thread = None
        self._expectations = []

    def expect_ping(self):
        """Expect a Ping request.

        Returns an Expectation to allow setting the response behavior."""
        exp = Expectation.messageType(
            tmessage.PingRequestMessage.message_type
        )

        self._expectations.append(exp)
        return exp

    def handle_call(self, context, connection):
        for exp in self._expectations:
            if exp.matches(context.message):
                exp.respond(context, connection)

    @contextmanager
    def client_connection(self):
        """Get an initiated Connection to this TChannel server."""
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(self.timeout)
        try:
            (host, port) = ('localhost', self.port)
            sock.connect((host, port))

            conn = tchannel.SocketConnection(sock)
            conn.initiate_handshake(headers={
                'host_port': '%s:%s' % (host, port),
                'process_name': 'tchannel_client-%s' % port
            })
            conn.await_handshake_reply()
            yield conn
        finally:
            sock.close()

    def start(self):
        assert self.thread is None, 'server already started'
        self.thread = threading.Thread(target=self.server.serve_forever)
        self.thread.start()

    def stop(self):
        self.server.shutdown()

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, *args):
        self.stop()


@pytest.yield_fixture
def server_manager(random_open_port):
    with ServerManager(random_open_port) as manager:
        yield manager


def test_ping_pong(server_manager):
    with server_manager.client_connection() as conn:
        resp = tmessage.PingResponseMessage()
        server_manager.expect_ping().and_return(resp)

        for i in xrange(1000):
            conn.ping()
            assert resp == next(conn).message
