#!/usr/bin/env python
from __future__ import absolute_import

import time

import tornado.iostream
import tornado.ioloop

from options import get_args
from tchannel.tornado.connection import TornadoConnection


@tornado.gen.coroutine
def main():

    args = get_args()
    conn = yield TornadoConnection.outgoing('%s:%d' % (args.host, args.port))

    N = 10000
    before = time.time()
    batch_size = 100
    for _ in xrange(N / batch_size):
        yield [conn.ping() for _ in xrange(batch_size)]

    after = time.time()
    elapsed = (after - before) * 1000
    print("Finish %d iterations in %d ms" % (N, elapsed))
    print("%.4f ops/s" % ((N / elapsed) * 1000))


if __name__ == '__main__':
    tornado.ioloop.IOLoop.instance().run_sync(main)
