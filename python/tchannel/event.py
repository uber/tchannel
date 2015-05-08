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

import collections
import logging
import functools

from enum import IntEnum
from enum import unique

log = logging.getLogger('tchannel')


@unique
class EventType(IntEnum):
    """Types to represent system events"""

    before_send_request = 0x00
    after_send_request = 0x01

    before_send_response = 0x10
    after_send_response = 0x11

    before_receive_request = 0x20
    after_receive_request = 0x21

    before_receive_response = 0x30
    after_receive_response = 0x31

    after_receive_protocol_error = 0x40
    after_send_protocol_error = 0x41


class EventHook(object):
    """provide all event hook interfaces

    Customized Hook should should inherit from EventHook class and implement
    the events' hooks that it wants to listen.

    Example::

        TraceHook(EventHook):
            def before_send_request(self, request):
                ....

    """
    def before_send_request(self, request):
        """Called before any part of a ``CALL_REQ`` message is sent."""
        pass

    def after_send_request(self, request):
        """Not implemented."""
        pass

    def before_send_response(self, response):
        """Not implemented."""
        pass

    def after_send_response(self, response):
        """Called after all of a ``CALL_RESP`` message is sent."""
        pass

    def before_receive_request(self, request):
        """Called after a ``CALL_REQ`` message's arg1 (endpoint) is read."""
        pass

    def after_receive_request(self, request):
        """Not implemented."""
        pass

    def before_receive_response(self, response):
        """Not implemented."""
        pass

    def after_receive_response(self, response):
        """Called after a ``CALL_RESP`` message is read."""
        pass

    def after_receive_protocol_error(self, error):
        """Called after a ''error'' message is read."""
        pass

    def after_send_protocol_error(self, error):
        """Called after a ''error'' message is sent."""
        pass


class EventEmitter(object):
    def __init__(self):
        self.hooks = collections.defaultdict(lambda: [])

    def register_hook(self, hook, event_type=None):
        """
        If ``event_type`` is provided, then ``hook`` will be called whenever
        that event is fired.

        If no ``event_type`` is specifid, but ``hook`` implements any methods
        with names matching an event hook, then those will be registered with
        their corresponding events. This allows for more stateful, class-based
        event handlers.
        """
        if event_type is not None:
            assert event_type in EventType, "unrecognized event type"
            return self.hooks[event_type].append(hook)

        for event_type in EventType:
            func = getattr(hook, event_type.name, None)
            if callable(func):
                self.register_hook(func, event_type)

    def fire(self, event, *args, **kwargs):
        for hook in self.hooks[event]:
            try:
                hook(*args, **kwargs)
            except Exception as e:
                log.error(e.message)


class EventRegistrar(object):

    def __init__(self, event_emitter):
        self.event_emitter = event_emitter

    def register(self, hook, event_type=None):
        return self.event_emitter.register_hook(hook, event_type)

    def __getattr__(self, attr):
        if attr in EventType.__members__:
            event_type = EventType[attr]
            return functools.partial(
                self.register,
                event_type=event_type,
            )
        return super(EventEmitter, self).__getattr__(attr)
