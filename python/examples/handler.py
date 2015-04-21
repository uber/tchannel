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

import random

import tornado.gen

from tchannel.tornado.dispatch import TornadoDispatcher
from tchannel.tornado.stream import InMemStream
from tchannel.tornado.util import print_arg, get_arg


@tornado.gen.coroutine
def say_hi(request, response, opts):
    arg2 = yield get_arg(request, 1)
    arg3 = yield get_arg(request, 2)
    response.argstreams = [
        InMemStream(request.endpoint),
        InMemStream(arg2),
        InMemStream(arg3)
    ]


@tornado.gen.coroutine
def say_ok(request, response, opts):
    yield print_arg(request, 1)
    yield print_arg(request, 2)

    response.argstreams = [
        InMemStream(),
        InMemStream(),
        InMemStream("world")]


@tornado.gen.coroutine
def echo(request, response, opts):
    # stream args right back to request side
    print "streaming"
    response.argstreams = [
        InMemStream(request.endpoint),
        request.argstreams[1],
        request.argstreams[2]
    ]


@tornado.gen.coroutine
def slow(request, response, opts):
    yield tornado.gen.sleep(random.random())
    response.argstreams = [
        InMemStream(),
        InMemStream(),
        InMemStream("done")]


def get_example_handler():
    dispatcher = TornadoDispatcher()

    dispatcher.register("hi", say_hi)
    dispatcher.register("ok", say_ok)
    dispatcher.register("echo", echo)
    dispatcher.register("slow", slow)

    @dispatcher.route("bye")
    def say_bye(request, response, opts):
        yield print_arg(request, 1)
        yield print_arg(request, 2)

        response.argstreams = [
            InMemStream(),
            InMemStream(),
            InMemStream("world")]

    return dispatcher
