from __future__ import absolute_import

import argparse
import logging
import sys

import tornado.ioloop

from .tchannel import TChannel


log = logging.getLogger('tchannel')

client = TChannel()
client.make_in_connection(9999)


@tornado.gen.coroutine
def tcurl(host, endpoint, headers, body):

    print("")
    print("Sending this to %s" % host)
    print("*" * 80)
    print(" arg1: %s" % endpoint)
    print(" arg2: %s" % headers)
    print(" arg3: %s" % body)
    print("")

    request = client.request(host)

    response = yield request.send(
        endpoint,
        headers,
        body,
    )

    print("")
    print("Got this from %s" % host)
    print("*" * 80)
    print(" arg1: %s" % getattr(response, 'arg_1', None))
    print(" arg2: %s" % getattr(response, 'arg_2', None))
    print(" arg3: %s" % getattr(response, 'arg_3', None))

    raise tornado.gen.Return(response)


def parse_args():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--serve-port",
        dest="port",
        default=None,
        type=int,
        help="Optional port to accept incoming requests on.",
    )

    parser.add_argument(
        "--host",
        dest="host",
        default="localhost:8888/",
        help="Hostname, port, and optional endpoint (arg1) to hit.",
    )

    parser.add_argument(
        "-d", "--body",
        dest="body",
        default='',
        help="arg3",
    )

    parser.add_argument(
        "--headers",
        dest="headers",
        default=None,
        help="arg2",
    )

    parser.add_argument(
        "-v", "--verbose",
        dest="verbose",
        action="store_true"
    )

    parser.add_argument(
        "-in", "--inport",
        dest="in_port",
        default="4040",
        help="port listened by in bound server"
    )

    return parser.parse_args()


def main():
    args = parse_args()

    if args.verbose:
        logging.basicConfig(
            format="%(name)s[%(process)s] %(levelname)s: %(message)s",
            stream=sys.stdout,
            level=logging.DEBUG,
        )

    # Transform something like "localhost:8888" into "localhost:8888/" so we
    # consider it as the '' endpoint.
    if '/' not in args.host:
        args.host += '/'

    host, endpoint = args.host.split('/', 1)

    tcurl(host, endpoint, args.headers, args.body)

    tornado.ioloop.IOLoop.instance().start()

if __name__ == '__main__':  # pragma: no cover
    main()
