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

import logging
import sys
from collections import defaultdict

from .formatters import json_formatter
from .formatters import thrift_formatter
from ..thrift import client_for
from ..tornado import hyperbahn

from .thrift import constants
from .thrift import TCollector

log = logging.getLogger('zipkin_tracing')

zipkin_log = logging.getLogger('zipkin')


class EndAnnotationTracer(object):
    """
    A tracer which collects all annotations for a trace until one of several
    possible "end annotations" is seen. An end annotation indicates that from
    the perspective of this tracer the trace is complete.
    """

    # Default list of end annotations.
    DEFAULT_END_ANNOTATIONS = (constants.CLIENT_RECV, constants.SERVER_SEND)

    def __init__(self, tracer, end_annotations=None):
        """
        :param tracer:
            An :py:class:`Tracer` to delegate to once an end annotation is
            seen.
        :param end_annotations:
            Names of possible end annotations. Defaults to
            ``DEFAULT_END_ANNOTATIONS``.
        :type end_annotations: list of strings
        """
        self._tracer = tracer
        self._end_annotations = end_annotations or self.DEFAULT_END_ANNOTATIONS
        self._annotations_for_trace = defaultdict(list)

    def record(self, traces):
        for (trace, annotations) in traces:
            trace_key = (trace.trace_id, trace.span_id)
            self._annotations_for_trace[trace_key].extend(annotations)

            for annotation in annotations:
                if annotation.name in self._end_annotations:
                    saved_annotations = self._annotations_for_trace[trace_key]

                    del self._annotations_for_trace[trace_key]

                    self._tracer.record([(trace, saved_annotations)])

                    break

            zipkin_log.debug(
                "%s: Sending trace: %s w/ %s",
                self.__class__.__name__,
                trace_key,
                annotations,
            )

    def flush(self):
        self._tracer.flush()


class RawZipkinTracer(object):
    """
    Send annotations to Zipkin as Base64-encoded Thrift via Python logging.

    This implementation logs all annotations immediately and does not implement
    buffering of any sort.
    """

    def __init__(self, logger):
        """
        :param logger:
            An :py:class:`logging.Logger` instance. A handler should be defined
            for this logger.
        """
        self._logger = logger

    def record(self, traces):
        for (trace, annotations) in traces:
            self._logger.info(
                thrift_formatter(trace, annotations, isbased64=True)
            )


TCollectorClient = client_for('tcollector', TCollector)


class TChannelZipkinTracer(object):
    """
    Send annotations to Zipkin as Base64-encoded Thrift via TChannel.

    This implementation sends all annotations immediately and doesn't implement
    buffering of any sort.
    """

    def __init__(self, tchannel, routers):
        """
        :param tchannel:
            A tchannel instance to send the trace info to zipkin server
        :param routers:
            A list contains hyperbahn instances' ip addresses
        """
        self._tchannel = tchannel
        self.client = TCollectorClient(self._tchannel)

        if routers:
            hyperbahn.advertise(self._tchannel, 'tcollector', routers)

    def record(self, traces):
        for (trace, annotations) in traces:
            try:
                self.client.submit(thrift_formatter(trace, annotations))
            except Exception as e:
                log.exception(e.message)


class ZipkinTracer(object):
    """
    Send annotations to Zipkin as Base64-encoded Thrift via Python logging.

    This is equivalent to

    .. code-block: python
        EndAnnotationTracer(
            BufferingTracer(
                RawZipkinTracer(logger)
            )
        )

    This implementation mostly exists for convenience.
    """

    def __init__(
        self,
        logger,
        end_annotations=None,
        max_traces=50,
    ):
        """
        :param logger: See :py:class:`RawZipkinTracer`.

        :param end_annotations: See :py:class:`EndAnnotationTracer`.

        :param max_traces: See :py:class:`BufferingTracer`.
        """
        self._tracer = EndAnnotationTracer(
            BufferingTracer(
                RawZipkinTracer(logger),
                max_traces=max_traces,
            ),
            end_annotations=end_annotations
        )

    def record(self, traces):
        return self._tracer.record(traces)

    def flush(self):
        self._tracer.flush()


class DebugTracer(object):
    """
    Send annotations immediately to a file-like destination in JSON format.

    All traces will be written immediately to the destination.
    """

    def __init__(self, destination=None):
        """
        :param destination:
            A file-like object to write JSON formatted traces to.
        """
        self.destination = destination or sys.stdout

    def record(self, traces):
        self.destination.write(json_formatter(traces))
        self.destination.write('\n')
        self.destination.flush()


class BufferingTracer(object):
    """
    Buffer traces and defer recording until `max_traces` have been received
    since the last trace was recorded.

    When `max_traces` is exceeded, all buffered traces will be flushed.  This
    means that for a max_traces of 5 if 10 traces are received, all 10 traces
    will be flushed to the next tracer.
    """

    def __init__(self, tracer, max_traces=50):
        """
        :param tracer:
            A :py:class:`Tracer` to record bufferred traces to.

        :param max_traces:
            The number of traces to buffer before recording occurs. Default 50.
        :type max_traces: int
        """
        self._max_traces = max_traces

        self._tracer = tracer
        self._buffer = []

    def flush(self):
        flushable = self._buffer
        self._buffer = []

        if flushable:
            self._tracer.record(flushable)

    def record(self, traces):
        self._buffer.extend(traces)

        if len(self._buffer) >= self._max_traces:
            self.flush()


_globalTracers = []


def set_tracers(tracers):
    global _globalTracers
    _globalTracers = tracers


def push_tracer(tracer):
    global _globalTracers
    _globalTracers.append(tracer)


def flush_tracers():
    for tracer in _globalTracers:
        try:
            tracer.flush()
        except AttributeError:
            pass


def get_tracers():
    return _globalTracers
