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

from collections import namedtuple

import tornado
import tornado.gen

from ..glossary import DEFAULT_TTL
from ..messages import ErrorCode
from ..messages.common import FlagsType
from ..messages.common import StreamState
from ..transport_header import RetryType
from ..zipkin.trace import Trace
from .stream import InMemStream
from .util import get_arg


class Request(object):
    """Represents an incoming request to an endpoint.

    Request class is used to represent the CallRequestMessage at User's level.
    This is going to hide the protocol level message information.
    """

    # TODO decide which elements inside "message" object to expose to user.
    def __init__(
        self,
        id=None,
        flags=FlagsType.none,
        ttl=DEFAULT_TTL,
        tracing=None,
        service=None,
        headers=None,
        checksum=None,
        argstreams=None,
        scheme=None,
        endpoint=None,
    ):
        self.flags = flags
        self.ttl = ttl
        self.service = service
        self.tracing = tracing or Trace()
        # argstreams is a list of InMemStream/PipeStream objects
        self.argstreams = argstreams or [InMemStream(),
                                         InMemStream(),
                                         InMemStream()]
        self.checksum = checksum
        self.id = id
        self.headers = headers or {}
        self.state = StreamState.init
        self.scheme = scheme

        self.is_streaming_request = self._is_streaming_request()
        if not self.is_streaming_request:
            self._copy_argstreams = [
                self.argstreams[0].clone(),
                self.argstreams[1].clone(),
                self.argstreams[2].clone(),
            ]

        self.endpoint = endpoint or ""

    def rewind(self, id=None):
        self.id = id
        if not self.is_streaming_request:
            self.argstreams = [
                self._copy_argstreams[0].clone(),
                self._copy_argstreams[1].clone(),
                self._copy_argstreams[2].clone(),
            ]
        self.state = StreamState.init
        self.tracing = Trace()

    @property
    def arg_scheme(self):
        return self.headers.get('as', None)

    def set_exception(self, exception):
        for stream in self.argstreams:
            stream.set_exception(exception)
            stream.close()

    def close_argstreams(self, force=False):
        for stream in self.argstreams:
            if stream.auto_close or force:
                stream.close()

    @tornado.gen.coroutine
    def get_header(self):
        """Get the header value from the request.

        :return: a future contains the deserialized value of header
        """
        raw_header = yield get_arg(self, 1)
        if not self.scheme:
            raise tornado.gen.Return(raw_header)
        else:
            header = self.scheme.deserialize_header(raw_header)
            raise tornado.gen.Return(header)

    @tornado.gen.coroutine
    def get_body(self):
        """Get the body value from the resquest.

        :return: a future contains the deserialized value of body
        """

        raw_body = yield get_arg(self, 2)
        if not self.scheme:
            raise tornado.gen.Return(raw_body)
        else:
            body = self.scheme.deserialize_body(raw_body)
            raise tornado.gen.Return(body)

    def get_header_s(self):
        """Get the raw stream of header.

        :return: the argstream of header
        """
        return self.argstreams[1]

    def get_body_s(self):
        """Get the raw stream of body.

        :return: the argstream of body
        """
        return self.argstreams[2]

    def _is_streaming_request(self):
        """check request is stream request or not"""
        arg2 = self.argstreams[1]
        arg3 = self.argstreams[2]
        return not (isinstance(arg2, InMemStream) and
                    isinstance(arg3, InMemStream) and
                    ((arg2.auto_close and arg3.auto_close) or (
                        arg2.state == StreamState.completed and
                        arg3.state == StreamState.completed)))

    def should_retry_on_error(self, error):
        """rules for retry

        :param error:
            ProtocolException that returns from Server
        """

        if self.is_streaming_request:
            # not retry for streaming request
            return False

        retry_flag = self.headers.get('re', RetryType.DEFAULT)

        if retry_flag == RetryType.NEVER:
            return False

        if error.code in [ErrorCode.bad_request, ErrorCode.cancelled,
                          ErrorCode.unhealthy]:
            return False
        elif error.code in [ErrorCode.busy, ErrorCode.declined]:
            return True
        elif error.code is ErrorCode.timeout:
            return retry_flag is not RetryType.CONNECTION_ERROR
        elif error.code in [ErrorCode.network_error,
                            ErrorCode.fatal,
                            ErrorCode.unexpected]:
            return retry_flag is not RetryType.TIMEOUT
        else:
            return False


class TransportMetadata(
    namedtuple('_Metadata', 'flags ttl service id headers')
):
    """A read-only representation of the metadata contained in the Request."""

    @classmethod
    def from_request(cls, request):
        return cls(
            flags=request.flags,
            ttl=request.ttl,
            service=request.service,
            id=request.id,
            headers=request.headers,
        )
