from __future__ import absolute_import

import argparse
import logging
import os
import sys

import tornado.ioloop

from .tchannel import TChannel


log = logging.getLogger('tchannel')


@tornado.gen.coroutine
def tcurl(host, endpoint, headers, body):

    client = TChannel()

    def handle_call(context):
        """Handle a TChannel CALL_REQ message."""
        if not context:
            log.debug("didn't receive context")
            return

        #connection.pong()
        log.debug("received message %s", context.message)
        log.debug(context.message.arg_1)
        log.debug(context.message.arg_1)
        log.debug(context.message.arg_2)
        log.debug(context.message.arg_3)

    print
    print "Sending this to", host
    print "*" * 80
    print " arg1:", endpoint
    print " arg2:", headers
    print " arg3:", body
    print

    request = client.request(host)

    response = yield request.send(
        endpoint,
        headers,
        body,
    )

    print
    print "Got this from", host
    print "*" * 80
    print " arg1:", getattr(response, 'arg_1', None)
    print " arg2:", getattr(response, 'arg_2', None)
    print " arg3:", getattr(response, 'arg_3', None)


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

    tornado.ioloop.IOLoop.instance().run_sync(
        lambda: tcurl(host, endpoint, args.headers, args.body)
    )


if __name__ == '__main__':
    main()
