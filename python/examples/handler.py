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
import time

import tornado.gen

from tchannel.handler import TChannelRequestHandler


def say_hi(request, response, opts):
    response.write(arg3="hi")


def say_ok(request, response, opts):
    response.write(arg3="ok")


def echo(request, response, opts):
    response.write(arg3=request.message.args[2])


@tornado.gen.coroutine
def slow(request, response, opts):
    yield tornado.gen.sleep(random.random())
    response.write(arg3="done")


def blocking(request, response, opts):
    time.sleep(random.random())
    response.write(arg3="yawn")


def get_example_handler():
    example_handler = TChannelRequestHandler()

    example_handler.register_handler("hi", say_hi)

    example_handler.register_handler("ok", say_ok)

    example_handler.register_handler("echo", echo)

    example_handler.register_handler("slow", slow)

    example_handler.register_handler("blocking", blocking)

    @example_handler.route("bye")
    def say_bye(request, response, opts):
        response.write("bye bye!")

    return example_handler
