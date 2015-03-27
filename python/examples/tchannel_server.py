from __future__ import absolute_import

import tornado.ioloop

from tchannel.tornado import TChannel

from options import get_args
from handler import get_example_handler


def main():  # pragma: no cover
    args = get_args()

    client = TChannel()

    handler = get_example_handler()

    server = client.host(args.port, handler)
    server.listen()
    tornado.ioloop.IOLoop.instance().start()


if __name__ == '__main__':  # pragma: no cover
    main()
