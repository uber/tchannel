from __future__ import absolute_import

import socket
import threading
try:
    import SocketServer
except ImportError:
    import socketserver as SocketServer
from contextlib import contextmanager

import tchannel.socket as tchannel
import tchannel.messages as tmessage


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
            return conn.frame_and_write(
                resp,
                message_id=ctx.message_id,
            )
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

    def expect_call_request(self, endpoint):
        if not isinstance(endpoint, bytes):
            endpoint = bytes(endpoint, 'ascii')

        def matcher(message):
            expected_type = tmessage.CallRequestMessage.message_type
            return (
                message.message_type == expected_type and
                message.arg_1 == endpoint
            )
        exp = Expectation(matcher)
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
            conn = tchannel.SocketConnection.outgoing('localhost:%d' % self.port)
            yield conn
        finally:
            conn.close()

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
