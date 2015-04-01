from __future__ import absolute_import

import random
import time

import tornado.gen

from tchannel.handler import TChannelRequestHandler


def say_hi(request, response, opts):
    response.write("hi")


def say_ok(request, response, opts):
    response.write("ok")


@tornado.gen.coroutine
def slow(request, response, opts):
    yield tornado.gen.sleep(random.random())
    response.write("done")


def blocking(request, response, opts):
    time.sleep(random.random())
    response.write("yawn")


def get_example_handler():
    example_handler = TChannelRequestHandler()

    example_handler.register_handler("hi", say_hi)

    example_handler.register_handler("ok", say_ok)

    example_handler.register_handler("slow", slow)

    example_handler.register_handler("blocking", blocking)

    @example_handler.route("bye")
    def say_bye(request, response, opts):
        response.write("bye bye!")

    return example_handler
