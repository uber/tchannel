from __future__ import absolute_import

import contextlib2
import tornado.ioloop

from ..exceptions import TimeoutException


@contextlib2.contextmanager
def timeout(future, seconds=2):
    # TODO: This is probably too heavy to attach to every request, should do
    # this in the background.

    @tornado.gen.coroutine
    def raise_timeout():
        yield tornado.gen.sleep(seconds)
        if future.running():
            future.set_exception(TimeoutException())

    tornado.ioloop.IOLoop.instance().add_callback(
        raise_timeout(),
    )

    yield
