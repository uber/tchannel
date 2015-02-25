#!/usr/bin/env python
from __future__ import absolute_import
import socket
import sys
import time

import tornado.iostream
import tornado.ioloop

from tchannel.tornado.connection import TornadoConnection


class MyClient(object):
    def __init__(self, connection, sock):
        self.connection = TornadoConnection(connection)
        self.sock = sock

        print("Initiating TChannel handshake...")

    @tornado.gen.coroutine
    def initiate_handshake(self):
        yield self.connection.initiate_handshake(headers={
            'host_port': '%s:%s' % self.sock.getsockname(),
            'process_name': sys.argv[0],
        })
        yield self.connection.await_handshake_reply()
        print(
            "Successfully completed handshake with %s" %
            self.connection.remote_process_name
        )

    def ping(self):
        return self.connection.ping()


@tornado.gen.coroutine
def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8888
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    stream = tornado.iostream.IOStream(sock)
    yield stream.connect(('localhost', port))
    print("Connected to port %d..." % port)
    client = MyClient(stream, sock)

    yield client.initiate_handshake()

    N = 10000
    before = time.time()
    batch_size = 100
    for _ in xrange(N / batch_size):
        yield [client.ping() for _ in xrange(batch_size)]

    after = time.time()
    elapsed = (after - before) * 1000
    print("Finish %d iterations in %d ms" % (N, elapsed))
    print("%.4f ops/s" % ((N / elapsed) * 1000))

    print("All done")

if __name__ == '__main__':
    tornado.ioloop.IOLoop.instance().run_sync(main)
