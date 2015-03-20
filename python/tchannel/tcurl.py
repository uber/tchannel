from __future__ import absolute_import

import argparse
import collections
import contextlib
import cProfile
import itertools
import logging
import pstats
import sys
import time

import tornado.ioloop
import tornado.web
from .tornado.http_request import HttpRequest
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
        "-r", "--rps",
        dest="rps",
        type=int,
        default=None,
        help=(
            "Throttle outgoing requests to this many per second."
        ),
    )

    parser.add_argument(
        "-v", "--verbose",
        dest="verbose",
        action="store_true"
    )

    parser.add_argument(
        "-q", "--quiet",
        dest="quiet",
        action="store_true",
        help="Don't display request/response information.",
    )

    parser.add_argument(
        "--profile",
        dest="profile",
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


class MainHandler(tornado.web.RequestHandler):
    def get(self):
        self.request.write("Hello, world")
        self.request.finish()


def make_app():
    application = tornado.web.Application([
        (r"/hello", MainHandler),
    ])

    return application


@tornado.gen.coroutine
def multi_tcurl(
    hostports,
    headers,
    bodies,
    in_port=None,
    profile=False,
    rps=None,
    quiet=False,
):
    app = make_app()
    client = TChannel(app=app)

    if in_port:
        client.make_in_connection(in_port)

    requests = getattr(itertools, 'izip', zip)(hostports, headers, bodies)
    futures = []

    with timing(profile=profile) as info:

        for hostport, header, body in requests:
            info['requests'] += 1

            futures.append(tcurl(client, hostport, header, body, quiet))

            if rps:
                yield tornado.gen.sleep(1.0 / rps)

        results = yield futures

    raise tornado.gen.Return(results)


@tornado.gen.coroutine
def tcurl(tchannel, hostport, headers, body, quiet=False):
    host, endpoint = hostport.split('/', 1)

    if not quiet:
        log.info("> Host: %s" % host)
        log.info("> Arg1: %s" % endpoint)
        log.info("> Arg2: %s" % headers)
        log.info("> Arg3: %s" % body)

    request = tchannel.request(host)

    response = yield request.send(
        endpoint,
        headers,
        body,
    )

    if not quiet:
        log.info("< Host: %s" % host)
        log.info("<  Msg: %s" % request.message_id)
        log.info("< arg1: %s" % getattr(response, 'arg_1', None))
        log.info("< arg2: %s" % getattr(response, 'arg_2', None))
        log.info("< arg3: %s" % getattr(response, 'arg_3', None))

    raise tornado.gen.Return(response)


@contextlib.contextmanager
def timing(profile=False):
    start = time.time()

    if profile:
        profiler = cProfile.Profile()
        profiler.enable()
    else:
        profiler = None

    info = collections.Counter()

    yield info

    if profiler:
        profiler.disable()
        profiler.create_stats()
        stats = pstats.Stats(profiler)
        stats.sort_stats('cumulative').print_stats(15)

    stop = time.time()

    # TODO: report errors/successes
    log.info(
        "took %.2fs for %s requests (%.2f rps)",
        stop - start,
        info['requests'],
        info['requests'] / (stop - start),
    )


def main():  # pragma: no cover
    args = parse_args()

    logging.basicConfig(
        format="%(name)s[%(process)s] %(levelname)s: %(message)s",
        stream=sys.stdout,
        level=logging.INFO,
    )

    if args.verbose:
        log.setLevel(logging.DEBUG)

    tornado.httputil.HTTPServerRequest = HttpRequest

    multi_tcurl(
        args.host,
        args.headers,
        args.body,
        args.in_port,
        profile=args.profile,
        rps=args.rps,
        quiet=args.quiet
    )

    if args.in_port:
        tornado.ioloop.IOLoop.instance().start()
    else:
        tornado.ioloop.IOLoop.instance().run_sync(lambda: None)


if __name__ == '__main__':  # pragma: no cover
    main()
