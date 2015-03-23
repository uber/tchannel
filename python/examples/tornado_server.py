from __future__ import absolute_import

import argparse
import sys

import tornado.ioloop
import tornado.web
from tchannel.tornado import TChannel
from tchannel.tornado.tornado_handler import TornadoRequestHandler


def parse_args(args=None):
    args = args or sys.argv[1:]

    parser = argparse.ArgumentParser()

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
    app = make_app()
    tchannel = TChannel()
    tornado_req_handler = TornadoRequestHandler(app)
    server = tchannel.host(args.in_port, tornado_req_handler)
    server.listen()
    tornado.ioloop.IOLoop.instance().start()


if __name__ == '__main__':  # pragma: no cover
    main()
