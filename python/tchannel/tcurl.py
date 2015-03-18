from __future__ import absolute_import

import argparse
import cProfile
import itertools
import logging
import pstats
import sys
import time

import tornado.ioloop

from .tornado import TChannel


log = logging.getLogger('tchannel')


def parse_args(args=None):
    args = args or sys.argv[1:]

    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--host",
        dest="host",
        default="localhost:8888/",
        nargs='+',
        help="Hostname, port, and optional endpoint (arg1) to hit.",
    )

    parser.add_argument(
        "-d", "--body",
        dest="body",
        default=[None],
        nargs='*',
        help=(
            "arg3. Can be specified multiple times to trigger simultaneous"
            "requests."
        ),
    )

    parser.add_argument(
        "-H", "--headers",
        dest="headers",
        default=[None],
        nargs='*',
        help=(
            "arg2. Can be speecified multiple time to trigger simultaneous"
            "requests."
        ),
    )

    parser.add_argument(
        "-v", "--verbose",
        dest="verbose",
        action="store_true"
    )

    parser.add_argument(
        "--profile",
        dest="profile",
        action="store_true"
    )

    args = parser.parse_args(args)

    # Allow a body/header to specified once and shared across multiple
    # requests.
    if args.headers and args.body and len(args.headers) != len(args.body):
        if len(args.headers) == 1:
            args.headers = args.headers * len(args.body)

        elif len(args.body) == 1:
            args.body = args.body * len(args.headers)

        else:
            raise argparse.ArgumentError(
                "Multiple header/body arguments given "
                "but not of the same degree."
            )

    if len(args.host) != max(1, len(args.headers), len(args.body)):
        if len(args.host) != 1:
            raise argparse.ArgumentError(
                "Number of hosts specified doesn't agree with the number of"
                "header/body arguments."
            )

        args.host = args.host * max(len(args.headers), len(args.body))

    # Transform something like "localhost:8888" into "localhost:8888/" so we
    # consider it as the '' endpoint.
    args.host = (h if '/' in h else h + '/' for h in args.host)

    return args


@tornado.gen.coroutine
def multi_tcurl(hostports, headers, bodies, profile=False):
    client = TChannel()

    futures = [
        tcurl(client, hostport, header, body)
        for hostport, header, body
        in getattr(itertools, 'izip', zip)(hostports, headers, bodies)
    ]

    start = time.time()

    if profile:
        profiler = cProfile.Profile()
        profiler.enable()
    else:
        profiler = None

    results = yield futures

    if profiler:
        profiler.disable()
        profiler.create_stats()
        stats = pstats.Stats(profiler)
        stats.strip_dirs().sort_stats('tot').print_stats(15)

    stop = time.time()

    log.debug(
        "took %.2fs for %s requests (%.2f rps)",
        stop - start,
        len(futures),
        len(futures) / (stop - start),
    )

    raise tornado.gen.Return(results)


@tornado.gen.coroutine
def tcurl(tchannel, hostport, headers, body):
    host, endpoint = hostport.split('/', 1)

    print("")
    print("Sending this to %s" % host)
    print("*" * 80)
    print(" arg1: %s" % endpoint)
    print(" arg2: %s" % headers)
    print(" arg3: %s" % body)
    print("")

    request = tchannel.request(host)

    response = yield request.send(
        endpoint,
        headers,
        body,
    )

    print("")
    print("Got this from %s for message %s" % (host, request.message_id))
    print("*" * 80)
    print(" arg1: %s" % getattr(response, 'arg_1', None))
    print(" arg2: %s" % getattr(response, 'arg_2', None))
    print(" arg3: %s" % getattr(response, 'arg_3', None))

    raise tornado.gen.Return(response)


def main():  # pragma: no cover
    args = parse_args()

    if args.verbose:
        logging.basicConfig(
            format="%(name)s[%(process)s] %(levelname)s: %(message)s",
            stream=sys.stdout,
            level=logging.DEBUG,
        )

    tornado.ioloop.IOLoop.instance().run_sync(
        lambda: multi_tcurl(args.host, args.headers, args.body, args.profile)
    )


if __name__ == '__main__':  # pragma: no cover
    main()
