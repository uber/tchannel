#!/usr/bin/env python
from __future__ import absolute_import
import json

import sys
from tornado import httputil
from tornado.httpserver import _ServerRequestAdapter
from tornado.httputil import RequestStartLine
import tornado.ioloop
import tornado.tcpserver
import socket

from tchannel.tornado.connection import TornadoConnection
class _ServerRequestAdapter():
    """Adapts the `TChannelMessageDelegate` interface to the interface expected
    by our clients.
    """
    def __init__(self, server, request_conn, server_conn=None):
        self.server = server
        self.connection = request_conn
        self.request = None
        if isinstance(server.request_callback,
                      httputil.HTTPServerConnectionDelegate):
            self.delegate = server.request_callback.start_request(
                server_conn, request_conn)
            self._chunks = None
        else:
            self.delegate = None
            self._chunks = []

    def headers_received(self, start_line, headers):
        # TODO implement xheaders
        #if self.server.xheaders:
        #    self.connection.context._apply_xheaders(headers)
        if self.delegate is None:
            self.request = httputil.HTTPServerRequest(
                connection=self.connection, start_line=start_line,
                headers=headers)
        else:
            return self.delegate.headers_received(start_line, headers)

    def data_received(self, chunk):
        if self.delegate is None:
            self._chunks.append(chunk)
        else:
            return self.delegate.data_received(chunk)

    def finish(self):
        if self.delegate is None:
            self.request.body = b''.join(self._chunks)
            self.request._parse_body()
            self.server.request_callback(self.request)
        else:
            self.delegate.finish()
        self._cleanup()

    def on_connection_close(self):
        if self.delegate is None:
            self._chunks = None
        else:
            self.delegate.on_connection_close()
        self._cleanup()

    def _cleanup(self):
        #if self.server.xheaders:
        #    self.connection.context._unapply_xheaders()
        pass

class InboundServer(tornado.tcpserver.TCPServer):
    def __init__(self, request_callback=None):
        self.request_callback = request_callback
        self.server_address = '/tmp/uds_socket'
        super(InboundServer, self).__init__()

    def build_stream(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect(self.server_address)

    def start_serving(self, request_conn):
        return _ServerRequestAdapter(self, request_conn)

    def handle_stream(self, stream, address):
        tchannel_connection = TornadoConnection(
            connection=stream
        )
        print "Inbound Server handle stream"
        self.request_delegate = self.start_serving(tchannel_connection)

        print("Received request from %s:%d" % address)

        print("Waiting for TChannel handshake...")
        tchannel_connection.await_handshake(headers={
            'host_port': '%s:%s' % address,
            'process_name': sys.argv[0],
        }, callback=self.handshake_complete)

    def handshake_complete(self, connection):
        print(
            "Successfully completed handshake with %s" %
            connection.remote_process_name
        )
        connection.handle_calls(self.preprocess_request)

    def preprocess_request(self, context, connection):
        print "preprocess request"

        message = context.message

        # process http message
        # TODO process tcp thrfit message
        if message.headers["as"] == "http":
            method = "GET"
            if message.arg_3 is not None:
                method = "POST"

            start_line = RequestStartLine(method, message.arg_1, 'HTTP/1.1')
            try:
                headers = json.loads(message.arg_2)
            except:
                headers = {}
            body = message.arg_3 or ""
            self.request_delegate.headers_received(start_line, headers)
            self.request_delegate.data_received(body)
            self.request_delegate.finish()

        #connection.handle_calls(self.preprocess_request)
