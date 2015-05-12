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

import tornado
import tornado.gen

from ..errors import TChannelError


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
        raise TChannelError()


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
