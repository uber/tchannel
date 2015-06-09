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

import base64
import socket
import struct

from thrift.protocol import TBinaryProtocol
from thrift.transport import TTransport

from tchannel.zipkin.thrift import ttypes

try:
    import ujson as json
except ImportError:  # pragma: nocover
    import json


def hex_str(n):
    return '%0.16x' % (n,)


def int_or_none(val):
    if val is None:
        return None

    return int(val, 16)


def json_formatter(traces, *json_args, **json_kwargs):
    json_traces = []

    for (trace, annotations) in traces:
        json_trace = {
            'trace_id': hex_str(trace.trace_id),
            'span_id': hex_str(trace.span_id),
            'name': trace.name,
            'annotations': []
        }

        if trace.parent_span_id:
            json_trace['parent_span_id'] = hex_str(trace.parent_span_id)

        for annotation in annotations:
            json_annotation = {
                'key': annotation.name,
                'value': annotation.value,
                'type': annotation.annotation_type
            }

            endpoint = annotation.endpoint or trace.endpoint

            if endpoint:
                json_annotation['host'] = {
                    'ipv4': endpoint.ipv4,
                    'port': endpoint.port,
                    'service_name': endpoint.service_name
                }

            json_trace['annotations'].append(json_annotation)

        json_traces.append(json_trace)

    return json.dumps(json_traces, *json_args, **json_kwargs)


def ipv4_to_int(ipv4):
    if ipv4 == 'localhost':
        ipv4 = '127.0.0.1'
    return struct.unpack('!i', socket.inet_aton(ipv4))[0]


def base64_thrift(thrift_obj):
    trans = TTransport.TMemoryBuffer()
    tbp = TBinaryProtocol.TBinaryProtocol(trans)

    thrift_obj.write(tbp)

    return base64.b64encode(trans.getvalue())


def binary_annotation_formatter(annotation):
    annotation_types = {
        'string': ttypes.AnnotationType.STRING,
        'bytes': ttypes.AnnotationType.BYTES,
    }

    annotation_type = annotation_types[annotation.annotation_type]

    value = annotation.value

    if isinstance(value, unicode):
        value = value.encode('utf-8')

    return ttypes.BinaryAnnotation(
        annotation.name,
        value,
        annotation_type
    )


def i64_to_string(data):
    return struct.pack('>q', data)


def thrift_formatter(trace, annotations, isbased64=False):
    thrift_annotations = []
    binary_annotations = []

    for annotation in annotations:
        host = None
        endpoint = annotation.endpoint or trace.endpoint
        if endpoint:
            host = ttypes.Endpoint(
                ipv4=ipv4_to_int(endpoint.ipv4),
                port=endpoint.port,
                service_name=endpoint.service_name,
            )

        if annotation.annotation_type == 'timestamp':
            thrift_annotations.append(ttypes.Annotation(
                timestamp=annotation.value,
                value=annotation.name))
        else:
            binary_annotations.append(
                binary_annotation_formatter(annotation))

    thrift_trace = ttypes.Span(
        trace_id=i64_to_string(trace.trace_id),
        name=trace.name,
        id=i64_to_string(trace.span_id),
        host=host,
        parent_id=i64_to_string(trace.parent_span_id),
        annotations=thrift_annotations,
        binary_annotations=binary_annotations
    )

    if isbased64:
        return base64_thrift(thrift_trace)
    else:
        return thrift_trace
