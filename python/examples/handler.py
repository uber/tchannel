from __future__ import absolute_import

from tchannel.handler import TChannelRequestHandler


def say_hi(request, response, opts):
    response.write("hi")


def say_ok(request, response, opts):
    response.write("ok")


#  def slow(request, response, opts):
    #  sleep
    #  write response


def get_example_handler():
    example_handler = TChannelRequestHandler()

    example_handler.register_handler("hi", say_hi)

    example_handler.register_handler("ok", say_ok)

    @example_handler.route("bye")
    def say_bye(request, response, opts):
        response.write("bye bye!")

    return example_handler
