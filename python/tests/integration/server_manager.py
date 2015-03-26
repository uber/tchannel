from __future__ import absolute_import

import threading
try:
    import SocketServer
except ImportError:
    import socketserver as SocketServer
from contextlib import contextmanager

import tornado

from tchannel.handler import TChannelRequestHandler
import tchannel.tornado.tchannel as tornado_tchannel
import tchannel.socket as socket_tchannel
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
        self.response = None

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
        self.response = resp

        def respond(ctx, conn):
            return conn.frame_and_write(
                resp,
                message_id=ctx.message_id,
            )

        self._respond = respond


class ServerManager(object):
    TIMEOUT = 0.15

    def __init__(self, port, timeout=None):
        self.port = port
        self.timeout = timeout or self.TIMEOUT

        self._expectations = []
        self.thread = None

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

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, *args):
        self.stop()

    def start(self):
        assert self.thread is None, 'server already started'
        self.thread = threading.Thread(target=self.serve)
        self.thread.start()

    def stop(self):
        self.shutdown()
        self.thread.join()


class TCPServerManager(ServerManager):
    """Provides a dynamically configurable TChannel server."""

    def __init__(self, port, timeout=None):
        super(TCPServerManager, self).__init__(port, timeout)

        manager = self

        class Handler(SocketServer.BaseRequestHandler):
            def setup(self):
                self.request.settimeout(manager.timeout)
                self.tchan_conn = socket_tchannel.SocketConnection(
                    self.request,
                )

            def handle(self):
                (host, port) = self.request.getsockname()
                self.tchan_conn.await_handshake(headers={
                    'host_port': '%s:%s' % (host, port),
                    'process_name': 'tchannel_server-%s' % port
                })
                self.tchan_conn.handle_calls(manager.handle_call)

        self.server = SocketServer.TCPServer(("", port), Handler)

    @contextmanager
    def client_connection(self):
        """Get an initiated Connection to this TChannel server."""
        try:
            conn = socket_tchannel.SocketConnection.outgoing(
                'localhost:%d' % self.port
            )
            yield conn
        finally:
            conn.close()

    def serve(self):
        self.server.serve_forever()

    def shutdown(self):
        self.server.shutdown()


class TChannelServerManager(ServerManager):

    def __init__(self, port, timeout=None):
        super(TChannelServerManager, self).__init__(port, timeout)

        self.handler = TChannelRequestHandler()
        self.tchannel = tornado_tchannel.TChannel()
        self.server = self.tchannel.host(port, self.handler)

    def serve(self):
        self.server.listen()
        tornado.ioloop.IOLoop.current().start()

    def shutdown(self):
        tornado.ioloop.IOLoop.current().stop()

    def expect_ping_request(self):
        raise NotImplementedError()

    def expect_call_request(self, endpoint):
        expectation = super(TChannelServerManager, self).expect_call_request(
            endpoint,
        )

        # TODO: this should match `handle_call` above in the TCP case...
        def handler(request, response, opts):
            # TODO: just call `resp_msg` a `message`...
            response.resp_msg = expectation.response

        self.handler.register_handler(endpoint, handler)

        return expectation
