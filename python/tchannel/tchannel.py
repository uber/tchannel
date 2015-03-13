from __future__ import absolute_import

import logging
import os
import sys
import socket

import tornado.ioloop
import tornado.iostream

from .tornado.connection import TornadoConnection
from .exceptions import InvalidMessageException
from .messages import CallRequestMessage
from .timeout import timeout


log = logging.getLogger('tchannel')


class TChannel(object):
    """Manages inbound and outbound connections to various hosts."""

    def __init__(self, process_name=None):
        self.peers = {}
        self.process_name = (
            process_name or "%s[%s]" % (sys.argv[0], os.getpid())
        )

        # TODO: self.server_socket = self.make_in_connection()

    @tornado.gen.coroutine
    def add_peer(self, hostport):
        if hostport in self.peers:
            return

        peer = yield self.make_out_connection(hostport)
        self.peers[hostport] = peer
        raise tornado.gen.Return(peer)

    def remove_peer(self, hostport):
        # TODO: Connection cleanup
        self.peers.pop(hostport)

    @tornado.gen.coroutine
    def get_peer(self, hostport):
        if hostport in self.peers:
            peer = self.peers[hostport]
        else:
            peer = yield self.add_peer(hostport)
        raise tornado.gen.Return(peer)

    @tornado.gen.coroutine
    def make_out_connection(self, hostport):
        host, port = hostport.rsplit(":", 1)

        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        stream = tornado.iostream.IOStream(sock)

        log.debug("connecting to hostport %s", hostport)

        yield stream.connect((host, int(port)))

        connection = TornadoConnection(stream)

        log.debug("initiating handshake with %s", sock.getsockname())

        yield connection.initiate_handshake(headers={
            'host_port': '%s:%s' % sock.getsockname(),
            'process_name': self.process_name,
        })

        log.debug("awaiting handshake reply")

        yield connection.await_handshake_reply()

        log.debug("completed handshake")

        raise tornado.gen.Return(connection)

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

        class TChannelClientOp(object):
            # Do we want/need to track these if we have timeouts? Maybe for
            # out-of-order responses?

            @tornado.gen.coroutine
            def send(opself, arg_1, arg_2, arg_3):
                # message = CallRequestMessage.from_context for zipkin shit
                message = CallRequestMessage()
                message.flags = 0
                message.ttl = 0
                message.span_id = 0
                message.parent_id = 0
                message.trace_id = 0
                message.traceflags = 0
                message.service = 'tcurl'
                message.headers = {}
                message.checksum_type = 0
                message.arg_1 = arg_1
                message.arg_2 = arg_2
                message.arg_3 = arg_3

                log.debug("framing and writing message")

                # Make this return a message ID so we can match it up with the
                # response.
                peer_connection = yield self.get_peer(hostport)
                yield peer_connection.frame_and_write(message)

                log.debug("awaiting response")

                # Pull this out into its own loop, look up response message ids
                # and dispatch them to handlers.
                with timeout(peer_connection):
                    response = yield peer_connection.await()

                log.debug("got response")

                if not response:
                    raise InvalidMessageException()

                raise tornado.gen.Return(response.message)

        return TChannelClientOp()
