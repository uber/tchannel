from __future__ import absolute_import

import logging
import os
import sys
import socket

import tornado.ioloop
import tornado.iostream

from ..exceptions import InvalidMessageException
from ..messages import CallRequestMessage
from .connection import TornadoConnection
from .timeout import timeout


log = logging.getLogger('tchannel')

awaiting_responses = {}

class TChannel(object):
    """Manages inbound and outbound connections to various hosts."""

    peers = {}

    def __init__(self, process_name=None):
        self.process_name = (
            process_name or "%s[%s]" % (sys.argv[0], os.getpid())
        )

        # TODO: self.server_socket = self.make_in_connection()

    @tornado.gen.coroutine
    def add_peer(self, hostport):
        if hostport not in self.peers:
            self.peers[hostport] = self.make_out_connection(hostport)
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

    # TODO: put this on the connection
    @tornado.gen.coroutine
    def make_out_connection(self, hostport, sock=None):
        host, port = hostport.rsplit(":", 1)

        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)

        # TODO: change this to tornado.tcpclient.TCPClient to do async DNS
        # lookups.
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

        @tornado.gen.coroutine
        def handle_call_response(context, connection):
            yield awaiting_responses[context.message_id].put(context)
            print "GOING BACK TO LISTENING", len(awaiting_responses)
            connection.handle_calls(handle_call_response)

        connection.handle_calls(handle_call_response)

        log.debug("completed handshake")

        raise tornado.gen.Return(connection)

    #@staticmethod
    #def handle_call_response(context, connection):
        #import ipdb; ipdb.set_trace()
        #if context.message_id in awaiting_responses:
            #yield awaiting_responses[context.message_id].put(context)
        #else:
            #print "WTF UNRECOGNIZED MESSAGE ID"

        #connection.handle_calls(self.handle_response)

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
        return TChannelClientOperation(hostport)


class TChannelClientOperation(object):

    def __init__(self, hostport):
        self.hostport = hostport
        self.message_id = None

    @tornado.gen.coroutine
    def send(self, arg_1, arg_2, arg_3):
        # message = CallRequestMessage.from_context for zipkin shit
        # Make this return a message ID so we can match it up with the
        # response.
        peer_connection = yield TChannel().get_peer(self.hostport)

        self.message_id = message_id = peer_connection.next_message_id()

        message = CallRequestMessage()
        message.flags = 0
        message.ttl = 0
        message.span_id = 0
        message.parent_id = 0
        message.trace_id = 0
        message.traceflags = 0
        message.service = b'tcurl'
        message.headers = {}
        message.checksum_type = 0
        message.arg_1 = arg_1
        message.arg_2 = arg_2
        message.arg_3 = str(message_id)

        log.debug("framing and writing message %s", message_id)

        yield peer_connection.frame_and_write(
            message,
            message_id=message_id,
        )

        log.debug("awaiting response for message %s", message_id)

        # Pull this out into its own loop, look up response message ids
        # and dispatch them to handlers.
        import toro
        awaiting_responses[message_id] = toro.Queue(1)

        # TODO: use real timeout here
        #with timeout(peer_connection):
        response = yield awaiting_responses[message_id].get()
        #print "JUST GOT", message_id
        del awaiting_responses[message_id]

        # TODO: Add a callback to remove ourselves from the ops
        # list.

        log.debug("got response for message %s", response.message_id)

        if not response:
            raise InvalidMessageException()

        raise tornado.gen.Return(response.message)
