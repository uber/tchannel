from __future__ import absolute_import

import argparse
import logging
import sys

import tornado.ioloop
import tornado.web
from tchannel.tornado import TChannel
from tchannel.req_handler import TChannelRequestHandler


log = logging.getLogger('tchannel')


def parse_args(args=None):
    args = args or sys.argv[1:]

    parser = argparse.ArgumentParser()

    parser.add_argument(
        "-v", "--verbose",
        dest="verbose",
        action="store_true"
    )

    parser.add_argument(
        "--listen",
        dest="in_port",
        default=None,
        type=int,
        help="Port for inbound connections"
    )

    args = parser.parse_args(args)
    return args


def handler1(request, response, opts):
    response.write("handler1 says hi")


def handler2(request, response, opts):
    response.write("handler2 says ok")


def main():  # pragma: no cover
    args = parse_args()

    logging.basicConfig(
        format="%(name)s[%(process)s] %(levelname)s: %(message)s",
        stream=sys.stdout,
        level=logging.INFO,
    )

    if args.verbose:
        log.setLevel(logging.DEBUG)

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

    server = client.host(args.in_port, handler)
    server.listen()
    tornado.ioloop.IOLoop.instance().start()


if __name__ == '__main__':  # pragma: no cover
    main()
