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

from mock import MagicMock

from tchannel.event import EventEmitter
from tchannel.event import EventType


def test_event_hook():
    mock_hook = MagicMock()
    mock_hook.send_request.return_value = None
    mock_hook.receive_request.return_value = None
    mock_hook.receive_response.return_value = None
    mock_hook.send_response.return_Value = None

    event_emitter = EventEmitter()
    event_emitter.register_hook(mock_hook)

    event_emitter.fire(EventType.receive_response, None)
    assert mock_hook.receive_response.called

    event_emitter.fire(EventType.receive_request, None)
    assert mock_hook.receive_request.called

    event_emitter.fire(EventType.send_request, None)
    assert mock_hook.send_request.called

    event_emitter.fire(EventType.send_response, None)
    assert mock_hook.send_response.called
