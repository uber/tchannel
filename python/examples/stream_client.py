import os
import sys
from options import get_args
import tornado
import tornado.ioloop
from tchannel.tornado import TChannel
from tchannel.tornado.stream import InMemStream, PipeStream
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
