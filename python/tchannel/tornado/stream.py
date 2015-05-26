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

from collections import deque

import tornado
import tornado.gen
import tornado.ioloop
from tornado.iostream import PipeIOStream
from tornado.iostream import StreamClosedError

from ..errors import StreamingError
from ..messages import common
from ..messages.common import StreamState

try:
    from tornado.locks import Condition
except ImportError:  # pragma: no cover
    from toro import Condition


@tornado.gen.coroutine
def read_full(stream):
    """Read the full contents of the given stream into memory.

    :return:
        A future containing the complete stream contents.
    """
    assert stream, "stream is required"

    chunks = []
    chunk = yield stream.read()
    while chunk:
        chunks.append(chunk)
        chunk = yield stream.read()

    raise tornado.gen.Return(b''.join(chunks))


class Stream(object):

    def read(self):
        """Async read from internal stream buffer

        if it reaches the end of the stream, it will return empty(""), caller
        will depend on the return value to tell if it reaches the end of the
        stream.

        It doesn't support seek functionality, which means it will only read
        the stream data once in single direction.

        NOTE: The data which has been read will be discarded in the stream.

        :return:chunk of bytes read from stream
        """
        raise NotImplementedError()

    def write(self, chunk):
        """Async write to internal stream buffer

        :raises StreamingError:
            if stream has been closed, it will raise StreamingError
        """
        raise NotImplementedError()

    def set_exception(self, exception):
        """Set exception to interrupt all Stream operations

        :param exception: exception to set
        """
        raise NotImplementedError()

    def close(self):
        raise NotImplementedError()

    def clone(self):
        """Deep clone the current stream"""
        raise NotImplementedError()


class InMemStream(Stream):

    def __init__(self, buf=None, auto_close=True):
        """In-Memory based stream

        :param buf: the buffer for the in memory stream
        """
        self._stream = deque()
        if buf:
            self._stream.append(buf)
        self.state = StreamState.init
        self._condition = Condition()
        self.auto_close = auto_close

        self.exception = None

    def clone(self):
        new_stream = self.__class__()
        new_stream.state = self.state
        new_stream.auto_close = self.auto_close
        new_stream._stream = deque(self._stream)
        return new_stream

    @tornado.gen.coroutine
    def read(self):
        if (self.state != StreamState.completed and
                len(self._stream) == 0):
            yield self._condition.wait()

        if self.exception:
            raise self.exception

        chunk = ""
        while len(self._stream) > 0 and len(chunk) < common.MAX_PAYLOAD_SIZE:
            chunk += self._stream.popleft()

        raise tornado.gen.Return(chunk)

    @tornado.gen.coroutine
    def write(self, chunk):
        if self.exception:
            raise self.exception

        if self.state == StreamState.completed:
            raise StreamingError("Stream has been closed.")
        if chunk:
            self._stream.append(chunk)
            self._condition.notify()

    def set_exception(self, exception):
        self.exception = exception
        self.close()

    @tornado.gen.coroutine
    def close(self):
        self.state = StreamState.completed
        self._condition.notify()


class PipeStream(Stream):

    def __init__(self, rpipe, wpipe=None, auto_close=False):
        """Pipe-based stream

        NOTE: reading from or writing to files, use os.open to get the file
        descriptor instead of python's open. Socket file descriptors and
        others are fine.

        when you use os.pipe to generate one write pipe and one read pipe, you
        need to pass both of them into init method.

        :param rpipe: an integer file descriptor which supports read ops
        :param wpipe: an integer file descriptor which supports write ops
        :param auto: flag to indicate to close the stream automatically or not
        """
        assert rpipe is not None
        self._rpipe = rpipe
        self._wpipe = wpipe

        self._rs = (PipeIOStream(self._rpipe) if
                    self._rpipe is not None else None)
        self._ws = (PipeIOStream(self._wpipe) if
                    self._wpipe is not None else None)
        self.auto_close = auto_close
        self.state = StreamState.init

        self.exception = None

    @tornado.gen.coroutine
    def read(self):
        if self.exception:
            raise self.exception

        if self.state == StreamState.completed or self._rpipe is None:
            raise tornado.gen.Return("")
        elif self.state == StreamState.init:
            self.state = StreamState.streaming

        chunk = ""
        try:
            chunk = yield self._rs.read_bytes(
                common.MAX_PAYLOAD_SIZE, partial=True)

        except StreamClosedError:
            # reach the end of the pipe stream
            self.state = StreamState.completed
        finally:
            if self.exception:
                raise self.exception
            raise tornado.gen.Return(chunk)

    @tornado.gen.coroutine
    def write(self, chunk):
        assert self._wpipe is not None
        if self.exception:
            raise self.exception

        try:
            yield self._ws.write(chunk)
            self.state = StreamState.streaming
        except StreamClosedError:
            self.state = StreamState.completed
            raise StreamingError("Stream has been closed.")
        finally:
            if self.exception:
                raise self.exception

    def set_exception(self, exception):
        self.exception = exception
        self.close()

    def close(self):
        self.state = StreamState.completed
        if self._ws and self.auto_close:
            self._ws.close()

        if self._rs and self.auto_close:
            self._rs.close()
