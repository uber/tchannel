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

import tornado
import tornado.gen

from ..enum import enum
from ..errors import TChannelError
from ..messages.common import FlagsType
from ..messages.common import StreamState
from .stream import InMemStream
from .util import get_arg

StatusCode = enum(
    'StatusCode',
    ok=0x00,
    error=0x01,
)


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
        return self.code

    @status_code.setter
    def status_code(self, status):
        if status not in StatusCode:
            raise TChannelError("Invalid status code!")

        self.code = status.value

    @property
    def ok(self):
        return self.code == StatusCode.ok.value

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

        :except TChannelError:
            Raise TChannelError if the stream is being sent when you try
            to change the stream.
        """
        if self.argstreams[2].state == StreamState.init:
            self.argstreams[2] = stream
        else:
            raise TChannelError(
                "Unable to change the body since the streaming has started")

    def set_header_s(self, stream):
        """Set customized header stream.

        Note: the header stream can only be changed before the stream
        is consumed.

        :param stream: InMemStream/PipeStream for header

        :except TChannelError:
            Raise TChannelError if the stream is being sent when you try
            to change the stream.
        """

        if self.argstreams[1].state == StreamState.init:
            self.argstreams[1] = stream
        else:
            raise TChannelError(
                "Unable to change the header since the streaming has started")

    def write_header(self, chunk):
        """Write to header.

        Note: the header stream is only available to write before write body.

        :param chunk: content to write to header

        :except TChannelError:
            Raise TChannelError if the response's flush() has been called
        """

        if self.scheme:
            header = self.scheme.serialize_header(chunk)
        else:
            header = chunk

        if self.flushed:
            raise TChannelError("write operation invalid after flush call")

        if (self.argstreams[0].state != StreamState.completed and
                self.argstreams[0].auto_close):
            self.argstreams[0].close()

        return self.argstreams[1].write(header)

    def write_body(self, chunk):
        """Write to header.

        Note: whenever write_body is called, the header stream will be closed.
        write_header method is unavailable.

        :param chunk: content to write to body

        :except TChannelError:
            Raise TChannelError if the response's flush() has been called
        """

        if self.scheme:
            body = self.scheme.serialize_body(chunk)
        else:
            body = chunk

        if self.flushed:
            raise TChannelError("write operation invalid after flush call")

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
