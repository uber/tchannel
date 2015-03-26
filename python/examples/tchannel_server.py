from __future__ import absolute_import

import tornado.ioloop

from options import get_args
from tchannel.tornado import TChannel
from tchannel.handler import TChannelRequestHandler


def handler1(request, response, opts):
    response.write("handler1 says hi")


def handler2(request, response, opts):
    response.write("handler2 says ok")


def main():  # pragma: no cover
    args = get_args()

    client = TChannel()

    handler = TChannelRequestHandler()
    handler.register_handler(
        r"/hi", handler1
    )
    handler.register_handler(
        r"/ok", handler2
    )

    @handler.route("/bye")
    def handler3(request, response, opts):
        response.write("handler3 says bye")

    server = client.host(args.port, handler)
    server.listen()
    tornado.ioloop.IOLoop.instance().start()


if __name__ == '__main__':  # pragma: no cover
    main()
