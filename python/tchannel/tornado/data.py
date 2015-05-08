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

import tornado
import tornado.gen

from ..exceptions import TChannelException
from ..messages.common import FlagsType
from ..messages.common import StreamState
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
            ttl=10,
            tracing=None,
            service=None,
            headers=None,
            checksum=None,
            argstreams=None,
            scheme=None,
    ):
        self.flags = flags
        self.ttl = ttl
        self.service = service
        self.tracing = tracing or Trace()
        # argstreams is a list of InMemStream/PipeStream objects
        self.argstreams = argstreams
        self.checksum = checksum
        self.id = id
        self.headers = headers or {}
        self.state = StreamState.init
        self.endpoint = ""
        self.header = None
        self.body = None
        self.scheme = scheme

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


class StatusCode(IntEnum):
    ok = 0x00,
    error = 0x01


class Response(object):
    """An outgoing response.

    Response class is used to represent the CallResponseMessage at User's
    level. This is going to hide the protocol level message information.
    """

    # TODO decide which elements inside "message" object to expose to user.
    def __init__(
            self,
            connection=None,
            id=None,
            flags=FlagsType.none,
            code=0,
            tracing=None,
            headers=None,
            checksum=None,
            argstreams=None,
            scheme=None,
    ):

        self.flags = flags or StatusCode.ok
        self.code = code
        self.tracing = tracing
        self.checksum = checksum
        # argstreams is a list of InMemStream/PipeStream objects
        self.argstreams = argstreams or [InMemStream(),
                                         InMemStream(),
                                         InMemStream()]
        self.headers = headers or {}
        self.id = id
        self.connection = connection
        self.state = StreamState.init
        self.flushed = False

        self.scheme = scheme

    @property
    def status_code(self):
        return self.flags

    @status_code.setter
    def status_code(self, status):
        if status not in StatusCode:
            raise TChannelException("Invalid status code!")

        self.flags = status.value

    @property
    def ok(self):
        if self.flags == StatusCode.ok.value:
            return True
        else:
            return False

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

    @tornado.gen.coroutine
    def get_header(self):
        """Get the header value from the response.

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
        """Get the body value from the response.

        :return: a future contains the deserialized value of body
        """

        raw_body = yield get_arg(self, 2)
        if not self.scheme:
            raise tornado.gen.Return(raw_body)
        else:
            body = self.scheme.deserialize_body(raw_body)
            raise tornado.gen.Return(body)

    def set_body_s(self, stream):
        """Set customized body stream.

        Note: the body stream can only be changed before the stream
        is consumed.

        :param stream: InMemStream/PipeStream for body

        :except TChannelException:
            Raise TChannelException if the stream is being sent when you try
            to change the stream.
        """
        if self.argstreams[2].state == StreamState.init:
            self.argstreams[2] = stream
        else:
            raise TChannelException(
                "Unable to change the body since the streaming has started")

    def set_header_s(self, stream):
        """Set customized header stream.

        Note: the header stream can only be changed before the stream
        is consumed.

        :param stream: InMemStream/PipeStream for header

        :except TChannelException:
            Raise TChannelException if the stream is being sent when you try
            to change the stream.
        """

        if self.argstreams[1].state == StreamState.init:
            self.argstreams[1] = stream
        else:
            raise TChannelException(
                "Unable to change the header since the streaming has started")

    def write_header(self, chunk):
        """Write to header.

        Note: the header stream is only available to write before write body.

        :param chunk: content to write to header

        :except TChannelException:
            Raise TChannelException if the response's flush() has been called
        """

        if self.scheme:
            header = self.scheme.serialize_header(chunk)
        else:
            header = chunk

        if self.flushed:
            raise TChannelException("write operation invalid after flush call")

        if (self.argstreams[0].state != StreamState.completed and
                self.argstreams[0].auto_close):
            self.argstreams[0].close()

        return self.argstreams[1].write(header)

    def write_body(self, chunk):
        """Write to header.

        Note: whenever write_body is called, the header stream will be closed.
        write_header method is unavailable.

        :param chunk: content to write to body

        :except TChannelException:
            Raise TChannelException if the response's flush() has been called
        """

        if self.scheme:
            body = self.scheme.serialize_body(chunk)
        else:
            body = chunk

        if self.flushed:
            raise TChannelException("write operation invalid after flush call")

        if (self.argstreams[0].state != StreamState.completed and
                self.argstreams[0].auto_close):
            self.argstreams[0].close()
        if (self.argstreams[1].state != StreamState.completed and
                self.argstreams[1].auto_close):
            self.argstreams[1].close()

        return self.argstreams[2].write(body)

    def flush(self):
        """Flush the response buffer.

        No more write or set operations is allowed after flush call.
        """
        self.flushed = True
        self.close_argstreams()

    def set_exception(self, exception):
        for stream in self.argstreams:
            stream.set_exception(exception)
            stream.close()

    def close_argstreams(self, force=False):
        for stream in self.argstreams:
            if stream.auto_close or force:
                stream.close()


class ProtocolError(object):
    """Object to represent protocol error message"""

    def __init__(
        self,
        code,
        description,
        id=None,
        tracing=None,
    ):
        self.code = code
        self.tracing = tracing
        self.id = id
        self.description = description
