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
from enum import IntEnum
import logging

log = logging.getLogger('tchannel')


class EventType(IntEnum):
    """Types to represent system events

    Events:

    send_request: before client sends request

    send_response: after server sends response

    receive_request: after server receive request

    receive_response: after client receive response

    """
    send_request = 0x00,
    send_response = 0x01,
    receive_request = 0x02,
    receive_response = 0x03


class EventHook(object):
    """provide all event hook interfaces

    Customized Hook should should inherit from EventHook class and implement
    the events' hooks that it wants to listen.

    Example::

        TraceHook(EventHook):
            def send_request(self, context):
                ....

    """

    def send_request(self, context):
        """Event hook for sending request

        :param context:
            request object to send
        """
        pass

    def send_response(self, context):
        """Event hook for sending response

        :param context:
            response object sent
        """
        pass

    def receive_request(self, context):
        """Event hook for receiving request

        :param context:
            request object received
        """
        pass

    def receive_response(self, context):
        """Event hook for receiving response

        :param context:
            response object received
        """
        pass


class EventEmitter(object):
    def __init__(self):
        self.hooks = []

    def register_hook(self, hook):
        self.hooks.append(hook)

    def fire(self, event, *args, **kwargs):
        # TODO find proper hook name
        event_hook_name = event.name
        for hook in self.hooks:
            try:
                getattr(hook, event_hook_name)(*args, **kwargs)
            except Exception as e:
                log.error(e.message)
