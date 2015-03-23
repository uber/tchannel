from __future__ import absolute_import

import argparse
import logging
import sys

import tornado.ioloop
import tornado.web
from tchannel.tornado import TChannel
from tchannel.tornado.tornado_req_handler import TornadoRequestHandler


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


class MainHandler(tornado.web.RequestHandler):
    def get(self):
        self.request.write("Hello, world")


def make_app():
    application = tornado.web.Application([
        (r"/hello", MainHandler),
    ])

    return application


def main():  # pragma: no cover
    args = parse_args()

    logging.basicConfig(
        format="%(name)s[%(process)s] %(levelname)s: %(message)s",
        stream=sys.stdout,
        level=logging.INFO,
    )

    if args.verbose:
        log.setLevel(logging.DEBUG)

    app = make_app()
    client = TChannel()
    tornado_req_handler = TornadoRequestHandler(app)
    server = client.host(args.in_port, tornado_req_handler)
    server.listen()
    tornado.ioloop.IOLoop.instance().start()


if __name__ == '__main__':  # pragma: no cover
    main()
