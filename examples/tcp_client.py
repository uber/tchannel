#!/usr/bin/env python
from __future__ import absolute_import

import socket
import sys

from tchannel.socket.connection import Connection


class MyClient(object):
    def __init__(self, connection):
        self.connection = Connection(connection)

        print("Initiating TChannel handshake...")
        self.connection.initiate_handshake()
        print("Successfully completed handshake")

    def ping(self):
        self.connection.ping()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8888
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.connect(('localhost', port))
    print("Connected to port %d..." % port)
    client = MyClient(sock)
    client.ping()
