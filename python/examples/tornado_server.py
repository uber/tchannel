from __future__ import absolute_import

import tornado.ioloop
import tornado.web

from options import get_args
from tchannel.tornado import TChannel
from tchannel.tornado.tornado_handler import TornadoRequestHandler


class MainHandler(tornado.web.RequestHandler):
    def get(self):
        self.request.write("Hello, world")


def make_app():
    application = tornado.web.Application([
        (r"/hello", MainHandler),
    ])

    return application


def main():  # pragma: no cover
    args = get_args()
    app = make_app()
    tchannel = TChannel()
    tornado_req_handler = TornadoRequestHandler(app)
    server = tchannel.host(args.port, tornado_req_handler)
    server.listen()
    tornado.ioloop.IOLoop.instance().start()


if __name__ == '__main__':  # pragma: no cover
    main()
