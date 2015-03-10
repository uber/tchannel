#!/usr/bin/env python
from __future__ import absolute_import

import socket
import sys
import time

from options import get_args
from tchannel.socket import SocketConnection


class MyClient(object):
    def __init__(self, connection):
        self.connection = SocketConnection(connection)

        print("Initiating TChannel handshake...")
        self.connection.initiate_handshake(headers={
            'host_port': '%s:%s' % connection.getsockname(),
            'process_name': sys.argv[0],
        })
        self.connection.await_handshake_reply()
        print(
            "Successfully completed handshake with %s" %
            self.connection.remote_process_name
        )

    def ping(self):
        self.connection.ping()


if __name__ == '__main__':
    args = get_args()

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.connect((args.host, args.port))
    print("Connected to port %d..." % args.port)
    client = MyClient(sock)

    N = 10000
    before = time.time()
    for _ in xrange(N):
        client.ping()
    after = time.time()
    elapsed = (after - before) * 1000
    print("Finish %d iterations in %d ms" % (N, elapsed))
    print("%.4f ops/s" % ((N / elapsed) * 1000))

    print("All done")
