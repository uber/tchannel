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

# Copyright 2012 Rackspace Hosting, Inc.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
from __future__ import absolute_import

import random


# TODO: cython
def _uniq_id():
    """Create a random 64-bit signed integer.

    Note: By experimentation Zipkin has trouble recording traces with ids
    larger than (2 ** 56) - 1.

    :rtype: int
    """
    return random.randint(0, (2 ** 56) - 1)


class Trace(object):
    """A Zipkin trace/span."""

    __slots__ = [
        'trace_id',
        'name',
        'span_id',
        'parent_span_id',
        'endpoint',
        '_tracers',
        'traceflags',
        'annotations'
    ]

    def __init__(
        self,
        name=None,
        trace_id=None,
        span_id=None,
        parent_span_id=0,
        endpoint=None,
        traceflags=0
    ):
        """
        :param name:
            Name of the current span.

        :param trace_id:
            Optional trace id used reconcile all spans associated with a
            request. If not provided a random id will be generated.
        :type trace_id: int or None

        :param span_id:
            Optional span id for this particular span. If not provided a random
            id will be generatd.
        :type span_id: int or None

        :param parent_span_id:
            Optional parent span id for this particular span. It not provided
            will remain ``None``.
        :type parent_span_id: int or None

        :param endpoint:
            A default :py:class:`Endpoint` instance to associate with all
            annotations for this trace. If an :py:class:`Annotation` explicitly
            defines its own :py:class:`Endpoint`, it will override this value.
        :type endpoint: :py:class:`Endpoint`

        :param tracers:
            Tracers to record this Trace's events. Primarily useful for unit
            testing.
        :type traces: list or :py:class:`Tracer`
        """
        # If no trace_id and span_id are given we want to generate new
        # 64-bit integer ids.
        self.name = name
        self.trace_id = trace_id or _uniq_id()
        self.span_id = span_id or _uniq_id()

        # If no parent_span_id is given then we assume there is no parent span
        # and leave it as None.
        self.parent_span_id = parent_span_id or 0

        self.traceflags = traceflags
        self.endpoint = endpoint
        self.annotations = []

    def __eq__(self, other):
        return (
            (self.trace_id, self.span_id, self.parent_span_id) ==
            (other.trace_id, other.span_id, other.parent_span_id)
        )

    def __ne__(self, other):
        return not self == other

    def __repr__(self):
        return (
            '{0.__class__.__name__},({0.name!r} trace_id={0.trace_id!r}, '
            'span_id={0.span_id!r}, parent_span_id={0.parent_span_id!r})'
        ).format(self)

    def child(self, name, endpoint=None):
        """
        Create a new instance of this class derived from the current instance
        such that::

            new.trace_id == current.trace_id

        and::

            new.parent_span_id == current.span_id

        The new :py:class:`Trace` instance will have a new unique span_id and
        if set the endpoint of the current :py:class:`Trace` object.

        :rtype: Trace
        """
        trace = self.__class__(
            name,
            trace_id=self.trace_id,
            parent_span_id=self.span_id,
            endpoint=self.endpoint
        )

        return trace
