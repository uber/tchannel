from __future__ import absolute_import

import time

import contextlib2
import tornado.ioloop


@contextlib2.contextmanager
def timeout(connection, seconds=2, callback=None):

    handle = tornado.ioloop.IOLoop.instance().add_timeout(
        time.time() + seconds,
        connection._connection._stream.close
    )

    yield handle

    tornado.ioloop.IOLoop.instance().remove_timeout(handle)
