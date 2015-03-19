#!/usr/bin/env python
from __future__ import absolute_import

import time

from options import get_args
from tchannel.socket import SocketConnection


if __name__ == '__main__':
    args = get_args()

    conn = SocketConnection.outgoing('%s:%d' % (args.host, args.port))

    N = 10000
    before = time.time()
    for _ in xrange(N):
        conn.ping()
    after = time.time()
    elapsed = (after - before) * 1000
    print("Finish %d iterations in %d ms" % (N, elapsed))
    print("%.4f ops/s" % ((N / elapsed) * 1000))

    print("All done")
