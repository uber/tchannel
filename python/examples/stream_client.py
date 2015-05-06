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

import os
import sys

import tornado
import tornado.ioloop

from options import get_args
from tchannel.tornado import TChannel
from tchannel.tornado.stream import InMemStream
from tchannel.tornado.stream import PipeStream
from tchannel.tornado.util import print_arg


@tornado.gen.coroutine
def send_stream(arg1, arg2, arg3, host):
    tchannel = TChannel()
    response = yield tchannel.request(host).send(
        arg1,
        arg2,
        arg3)

    yield print_arg(response, 0)
    yield print_arg(response, 1)
    yield print_arg(response, 2)


def main():
    args = get_args()

    arg1 = InMemStream("echo")
    arg2 = InMemStream()
    arg3 = InMemStream()

    ioloop = tornado.ioloop.IOLoop.current()
    if args.filename == "stdin":
        arg3 = PipeStream(sys.stdin.fileno())
        send_stream(arg1, arg2, arg3, args.host)
        ioloop.start()
    elif args.filename:
        f = os.open(args.filename, os.O_RDONLY)
        arg3 = PipeStream(f)
        ioloop.run_sync(lambda: send_stream(arg1, arg2, arg3, args.host))
    else:
        raise NotImplementedError()

if __name__ == '__main__':  # pragma: no cover
    main()
