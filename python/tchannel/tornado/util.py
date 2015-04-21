from __future__ import absolute_import

import tornado
import tornado.gen
from ..exceptions import TChannelException


@tornado.gen.coroutine
def get_arg(context, index):
    """get value from arg stream in async way"""
    if index < len(context.argstreams):
        arg = ""
        chunk = yield context.argstreams[index].read()
        while chunk:
            arg += chunk
            chunk = yield context.argstreams[index].read()

        raise tornado.gen.Return(arg)
    else:
        raise TChannelException()


@tornado.gen.coroutine
def print_arg(request, index):
    assert index < len(request.argstreams)
    try:
        chunk = yield request.argstreams[index].read()
        print chunk
        while chunk:
            chunk = yield request.argstreams[index].read()
            if chunk:
                print chunk
    except Exception:
        pass
