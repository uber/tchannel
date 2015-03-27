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

    def __init__(self):
        self.peers = {}

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

    def request(self, hostport, service=None):
        return TChannelClientOperation(hostport, service, self)

    def host(self, port, handler):
        return TChannelServerOperation(port, handler)


class TChannelServerOperation(object):

    def __init__(self, port, handler):
        self.inbound_server = InboundServer(handler)
        self.port = port

    def listen(self):
        self.inbound_server.listen(self.port)


class TChannelClientOperation(object):

    def __init__(self, hostport, service, tchannel):
        self.hostport = hostport
        self.message_id = None
        self.service = service or ''
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
            service=self.service,
            arg_1=safebytes(arg_1),
            arg_2=arg_2,
            arg_3=arg_3,
        )

        log.debug("framing and writing message %s", message_id)

        # TODO: return response future here?
        yield peer_connection.frame_and_write(
            message,
            message_id=message_id,
        )

        log.debug("awaiting response for message %s", message_id)

        # Pull this out into its own loop, look up response message ids
        # and dispatch them to handlers.
        response_future = tornado.gen.Future()
        peer_connection.awaiting_responses[message_id] = response_future
        with timeout(response_future):
            response = yield response_future

        log.debug("got response for message %s", response.message_id)

        if not response:
            raise InvalidMessageException()

        raise tornado.gen.Return(response.message)
