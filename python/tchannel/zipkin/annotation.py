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
import math
import time

from tchannel.zipkin.thrift import constants

Endpoint = collections.namedtuple(
    'Endpoint',
    'ipv4, port, service_name'
)


_AnnotationBase = collections.namedtuple(
    'Annotation',
    'name, value, annotation_type, endpoint',
)


class Annotation(_AnnotationBase):

    def __new__(cls, name, value, annotation_type, endpoint=None):
        """
        :param name:
            Name of this annotation.
        :type name: str

        :param value:
            A value of the appropriate type based on ``annotation_type``.

        :param annotation_type:
            The expected type of our ``value``. Expected values are
            ``'string'`` and ``'bytes'``.
        :type annotation_type: str

        :param endpoint:
            An optional :py:class:`Endpoint` to associate with
            this annotation.
        :type endpoint: Endpoint or None
        """
        return super(Annotation, cls).__new__(
            cls,
            name,
            value,
            annotation_type,
            endpoint,
        )


def timestamp(name, ts=None):
    if ts is None:
        ts = math.trunc(time.time() * 1000)

    return Annotation(name, ts, 'timestamp')


def client_send(ts=None):
    return timestamp(constants.CLIENT_SEND, ts)


def client_recv(ts=None):
    return timestamp(constants.CLIENT_RECV, ts)


def server_send(ts=None):
    return timestamp(constants.SERVER_SEND, ts)


def server_recv(ts=None):
    return timestamp(constants.SERVER_RECV, ts)


def string(name, value):
    return Annotation(name, value, 'string')


def bytes(name, value):
    return Annotation(name, value, 'bytes')
