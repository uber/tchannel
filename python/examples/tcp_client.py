#!/usr/bin/env python
from __future__ import absolute_import

import socket
import sys
import time

from tchannel.socket import Connection


class MyClient(object):
    def __init__(self, connection):
        self.connection = Connection(connection)

        print("Initiating TChannel handshake...")
        self.connection.initiate_handshake(headers={
            'host_port': '%s:%s' % connection.getsockname(),
            'process_name': sys.argv[0],
        })
        print("Successfully completed handshake")

    def ping(self):
        print("Ping...")
        self.connection.ping()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8888
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.connect(('localhost', port))
    print("Connected to port %d..." % port)
    client = MyClient(sock)

    client.ping()
    time.sleep(0.1)
    client.ping()

    print("All done")
