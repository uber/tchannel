from __future__ import absolute_import

import contextlib2
import tornado.ioloop

from ..exceptions import TimeoutException


import tornado


@contextlib2.contextmanager
def timeout(future, seconds=1, io_loop=None):
    # TODO: This is probably too heavy to attach to every request, should do
    # this in the background.
    io_loop = io_loop or tornado.ioloop.IOLoop.instance()

    def raise_timeout(*args, **kwargs):
        if future.running():
            future.set_exception(TimeoutException())

    io_loop.call_later(seconds, raise_timeout)

    yield
