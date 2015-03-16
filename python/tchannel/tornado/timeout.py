from __future__ import absolute_import

import contextlib2
import tornado.ioloop


@contextlib2.contextmanager
def timeout(connection, seconds=2):

    handle = tornado.ioloop.IOLoop.instance().call_later(
        seconds,
        connection.close,
    )

    yield handle

    tornado.ioloop.IOLoop.instance().remove_timeout(handle)
