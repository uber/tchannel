from __future__ import absolute_import

import logging
import weakref

import tornado.ioloop
import tornado.iostream

from ..exceptions import InvalidMessageException
from ..messages import CallRequestMessage
from .connection import TornadoConnection
from .timeout import timeout
from .inbound_server import InboundServer

log = logging.getLogger('tchannel')


class TChannel(object):
    """Manages inbound and outbound connections to various hosts."""

    def __init__(self, app=None):
        self.peers = {}
        self.inbound_server = InboundServer(app)
        self.endpoints = {}

    @tornado.gen.coroutine
    def add_peer(self, hostport):
        if hostport not in self.peers:
            self.peers[hostport] = TornadoConnection.outgoing(hostport)
            yield self.peers[hostport]

        # We only want one connection at a time, someone else is
        # connecting so wait for them without blocking.
        while self.peers[hostport].running():
            yield tornado.gen.sleep(0.0)

        raise tornado.gen.Return(self.peers[hostport].result())

    def remove_peer(self, hostport):
        # TODO: Connection cleanup
        return self.peers.pop(hostport)

    @tornado.gen.coroutine
    def get_peer(self, hostport):
        peer = yield self.add_peer(hostport)

        raise tornado.gen.Return(peer)

    @tornado.gen.coroutine
    def make_in_connection(self, port):
        self.inbound_server.listen(port)

    def request(self, hostport):
        return TChannelClientOperation(hostport, self)

    def route(self, rule, **opts):
        def decorator(handler):
            self.register_handler(rule, handler, **opts)
            return handler

        return decorator

    def register_handler(self, rule, handler, **opts):
        self.endpoints[rule] = {
            "handler": handler,
            "opts": opts
        }

    def dispatch_request(self, rule):
        return self.endpoints.get(rule, None)


class TChannelClientOperation(object):

    def __init__(self, hostport, tchannel):
        self.hostport = hostport
        self.message_id = None
        self.tchannel = weakref.ref(tchannel)

    @tornado.gen.coroutine
    def send(self, arg_1, arg_2, arg_3):
        # message = CallRequestMessage.from_context for zipkin shit
        # Make this return a message ID so we can match it up with the
        # response.
        peer_connection = yield self.tchannel().get_peer(self.hostport)
        self.message_id = message_id = peer_connection.next_message_id()

        def safebytes(arg):
            if arg is None:
                return None
            if isinstance(arg, bytes):
                return arg
            return bytes(arg.encode('ascii'))

        message = CallRequestMessage(
            service='tcurl',
            arg_1=safebytes(arg_1),
            arg_2=arg_2,
            arg_3=arg_3,
        )

        log.debug("framing and writing message %s", message_id)

        yield peer_connection.frame_and_write(
            message,
            message_id=message_id,
        )

        # Pull this out into its own loop, look up response message ids
        # and dispatch them to handlers.

        #with timeout(response_future):
        # TODO: better interface
        response = yield peer_connection.awaiting_responses[message_id]

        log.debug("got response for message %s", response.message_id)

        if not response:
            raise InvalidMessageException()

        raise tornado.gen.Return(response.message)
