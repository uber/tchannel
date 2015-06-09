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

from __future__ import absolute_import

import threading

import tornado.ioloop

import tchannel.tornado.tchannel as tornado_tchannel
from tchannel.errors import TChannelError


class Expectation(object):
    """Represents an expectation for the TestServer."""

    def __init__(self):
        self.execute = None

    def and_write(self, body, headers=None):

        def execute(request, response):
            if headers:
                response.write_header(headers)

            response.write_body(body)

        self.execute = execute

    def and_result(self, result):

        def execute(request, response):
            response.write_result(result)

        # raw message to respond with
        self.response = None
        self.protocoal_error = None

        self.execute = execute

    def return_error(self, error):
        """Write the given Error as a error response"""
        self.protocoal_error = error

    def and_raise(self, exc):

        def execute(request, response):
            raise exc

        self.execute = execute

    def and_error(self, protocoal_error):

        def execute(request, response):
            # send error message for test purpose only
            connection = response.connection
            connection.send_error(
                protocoal_error.code,
                protocoal_error.description,
                response.id,
            )
            # stop normal response streams
            response.set_exception(TChannelError("stop stream"))


class TestServer(object):
    TIMEOUT = 0.15

    def __init__(self, port, timeout=None):
        self.port = port
        self.tchannel = tornado_tchannel.TChannel(
            name='test',
            hostport="localhost:%d" % self.port,
        )

        self.timeout = timeout or self.TIMEOUT
        self.thread = None
        self.ready = False

    def expect_call(self, endpoint, scheme=None, **kwargs):
        if scheme is not None:
            assert isinstance(scheme, basestring)

        expectation = Expectation()

        def handle_expected_endpoint(request, response, proxy):
            expectation.execute(request, response)

        self.tchannel.register(
            endpoint, scheme, handle_expected_endpoint, **kwargs
        )
        return expectation

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, *args):
        self.stop()

    def start(self):
        assert self.thread is None, 'server already started'
        self.thread = threading.Thread(target=self.serve)
        self.thread.start()
        while not self.ready:
            pass

    def serve(self):
        self.tchannel.listen()
        self.ready = True
        tornado.ioloop.IOLoop.current().start()

    def stop(self):
        self.shutdown()
        self.thread.join()

    def shutdown(self):
        tornado.ioloop.IOLoop.current().stop()
