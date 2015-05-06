#!/usr/bin/env python

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

import time

import tornado.ioloop
import tornado.iostream

from options import get_args
from tchannel.tornado.connection import StreamConnection


@tornado.gen.coroutine
def main():

    args = get_args()
    conn = yield StreamConnection.outgoing('%s:%d' % (args.host, args.port))

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
