from __future__ import absolute_import

import logging
import weakref

import tornado.ioloop
import tornado.iostream

from ..exceptions import InvalidMessageException
from ..messages import CallRequestMessage
from .connection import TornadoConnection
from .timeout import timeout


log = logging.getLogger('tchannel')


class TChannel(object):
    """Manages inbound and outbound connections to various hosts."""

    def __init__(self, process_name=None):
        self.peers = {}
        self.awaiting_responses = {}
        self.process_name = (
            process_name or "%s[%s]" % (sys.argv[0], os.getpid())
        )

        # TODO: self.server_socket = self.make_in_connection()

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
    def make_in_connection(self):
        raise NotImplementedError

    def listen(self):
        # TODO: listen to inbound handshakes
        raise NotImplementedError

    def respond(self):
        # TODO: handle inbound requests
        raise NotImplementedError

    def request(self, hostport):
        return TChannelClientOperation(hostport, self)


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

        log.debug("awaiting response for message %s", message_id)

        # Pull this out into its own loop, look up response message ids
        # and dispatch them to handlers.
        self.tchannel().awaiting_responses[message_id] = tornado.gen.Future()

        # TODO: use real timeout here
        with timeout(peer_connection):
            response = yield self.tchannel().awaiting_responses[message_id]
        del self.tchannel().awaiting_responses[message_id]

        # TODO: Add a callback to remove ourselves from the ops
        # list.

        log.debug("got response for message %s", response.message_id)

        if not response:
            raise InvalidMessageException()

        raise tornado.gen.Return(response.message)
