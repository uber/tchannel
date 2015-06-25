# Copyright (c) 2015 Uber Technologies, Inc.
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in
# all copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
# THE SOFTWARE.

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
            "arg3. Can be specified multiple times to trigger simultaneous "
            "requests."
        ),
    )

    parser.add_argument(
        "-s", "--service",
        dest="service",
        default=None,
        help=(
            "Name of destination service (for tchannel routing)."
        ),
    )

    parser.add_argument(
        "-H", "--headers",
        dest="headers",
        default=[None],
        nargs='*',
        help=(
            "arg2. Can be speecified multiple time to trigger simultaneous "
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
        "--batch-size",
        dest="batch_size",
        type=int,
        default=100,
        help="Maximum number of outstanding requests.",
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
            parser.error(
                "Multiple header/body arguments given "
                "but not of the same degree."
            )

    if len(args.host) != max(1, len(args.headers), len(args.body)):
        if len(args.host) != 1:
            parser.error(
                "Number of hosts specified doesn't agree with the number of "
                "header/body arguments."
            )

        args.host = args.host * max(len(args.headers), len(args.body))

    # Transform something like "localhost:8888" into "localhost:8888/" so we
    # consider it as the '' endpoint.
    args.host = (h if '/' in h else h + '/' for h in args.host)

    return args


def chunk(iterable, n):
    while True:
        chunk = tuple(itertools.islice(iterable, n))
        if not chunk:
            return
        yield chunk


@tornado.gen.coroutine
def multi_tcurl(
    tchannel,
    hostports,
    headers,
    bodies,
    service,
    profile=False,
    rps=None,
    quiet=False,
    batch_size=100,
):
    all_requests = getattr(itertools, 'izip', zip)(hostports, headers, bodies)

    with timing(profile):
        for requests in chunk(all_requests, batch_size):
            futures = []

            for hostport, header, body in requests:
                futures.append(
                    tcurl(tchannel, hostport, header, body, service, quiet)
                )

                if rps:
                    yield tornado.gen.sleep(1.0 / rps)

            wait_iterator = tornado.gen.WaitIterator(*futures)
            results = []

            while not wait_iterator.done():
                try:
                    results.append((yield wait_iterator.next()))
                except Exception:
                    raise

    raise tornado.gen.Return(results)


@tornado.gen.coroutine
def tcurl(tchannel, hostport, headers, body, service, quiet=False):
    host, endpoint = hostport.split('/', 1)

    if not quiet:
        log.debug("> Host: %s" % host)
        log.debug("> Arg1: %s" % endpoint)
        log.debug("> Arg2: %s" % headers)
        log.debug("> Arg3: %s" % body)

    request = tchannel.request(host, service)

    response = yield request.send(
        endpoint,
        headers,
        body,
    )

    if not quiet:
        log.debug("< Host: %s" % host)
        log.debug("<  Msg: %s" % response.id)

    raise tornado.gen.Return(response)


@contextlib.contextmanager
def timing(profile=False):
    start = time.time()

    profiler = None

    if profile:
        profiler = cProfile.Profile()
        profiler.enable()

    info = collections.Counter()

    yield info

    if profiler:
        profiler.disable()
        profiler.create_stats()
        stats = pstats.Stats(profiler)
        stats.sort_stats('time').print_stats(15)

    stop = time.time()

    log.info("took %.2fs seconds" % (stop - start))


@tornado.gen.coroutine
def main(argv=None):
    args = parse_args(argv)

    logging.basicConfig(
        format="%(name)s[%(process)s] %(levelname)s: %(message)s",
        stream=sys.stdout,
        level=logging.INFO,
    )

    log.setLevel(logging.INFO)
    if args.verbose:
        log.setLevel(logging.DEBUG)

    tchannel = TChannel(name='tcurl.py')

    results = yield multi_tcurl(
        tchannel,
        args.host,
        args.headers,
        args.body,
        args.service,
        profile=args.profile,
        rps=args.rps,
        quiet=args.quiet,
        batch_size=args.batch_size,
    )

    raise tornado.gen.Return(results)


def start_ioloop():  # pragma: no cover
    ioloop = tornado.ioloop.IOLoop.current()
    ioloop.run_sync(main)


if __name__ == '__main__':  # pragma: no cover
    start_ioloop()
