# Copyright (c) 2015 Uber Technologies, Inc.
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in
# all copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
# THE SOFTWARE.

import json

from tornado import httputil
from tornado.httputil import RequestStartLine
from ..handler import RequestHandler
import tornado.httputil

from .http_request import HttpRequest
from .tornado_http_connection import TornadoHttpConnection

tornado.httputil.HTTPServerRequest = HttpRequest


class TornadoRequestHandler(RequestHandler):
    def __init__(self, app):
        self.request_callback = app

    def start_serving(self, request_conn, context):
        http_conn = TornadoHttpConnection(request_conn.connection, context)
        return _ServerRequestAdapter(self, http_conn)

    def handle_request(self, context, conn):
        """dispatch incoming request to particular endpoint

        :param context: context contains received CallRequestMessage
        :param conn: An incoming TornadoConnection
        """
        request_delegate = self.start_serving(conn, context)
        message = context.message
        # process http message
        # TODO need a better way to figure out
        # message's method type
        if message.headers.get("as") == "http":
            method = "GET"
            if (message.arg_3 is not None and
                    message.arg_3 != ""):
                method = "POST"

            start_line = RequestStartLine(method, message.arg_1, 'HTTP/1.1')
            try:
                headers = json.loads(message.arg_2)
            except:
                headers = {}
            body = message.arg_3 if hasattr(message, "arg_3") else ""
            request_delegate.headers_received(start_line, headers)
            request_delegate.data_received(body)
            request_delegate.finish()
        else:
            # TODO process message in json/thrift format
            raise NotImplementedError()


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
        # TODO cleanup work
        pass
