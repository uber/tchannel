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

from tchannel.tornado.dispatch import TornadoDispatcher
import tchannel.tornado.tchannel as tornado_tchannel


class Expectation(object):
    """Represents an expectation for the ServerManager."""
    def __init__(self):
        # raw message to respond with
        self.response = None

    def and_return(self, resp):
        """Write the given Message as a response."""
        self.response = resp


class ServerManager(object):
    TIMEOUT = 0.15

    def __init__(self, port, timeout=None):
        self.port = port
        self.timeout = timeout or self.TIMEOUT

        self.thread = None
        self.ready = False
        self.dispatcher = None

    def expect_call(self, endpoint):
        assert self.dispatcher, "dispatcher not configured"

        if not isinstance(endpoint, bytes):
            endpoint = bytes(endpoint, 'ascii')

        expectation = Expectation()

        def handle_expected_endpoint(request, response, opts):
            response.argstreams = expectation.response.argstreams

        self.dispatcher.register(endpoint, handle_expected_endpoint)
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
        raise NotImplementedError()

    def stop(self):
        self.shutdown()
        self.thread.join()

    def shutdown(self):
        raise NotImplementedError()


class TChannelServerManager(ServerManager):

    def __init__(self, port, timeout=None):
        super(TChannelServerManager, self).__init__(port, timeout)

        self.dispatcher = TornadoDispatcher()
        self.tchannel = tornado_tchannel.TChannel("localhost:%d" % self.port)
        self.port = port

    def serve(self):
        self.tchannel.host(self.dispatcher).listen()
        self.ready = True
        tornado.ioloop.IOLoop.current().start()

    def shutdown(self):
        tornado.ioloop.IOLoop.current().stop()
