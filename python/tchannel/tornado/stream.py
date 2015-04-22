import tornado
import tornado.gen
import tornado.ioloop
from tornado.iostream import PipeIOStream, StreamClosedError
from ..exceptions import StreamingException
from ..messages.common import StreamState
from ..messages import common

try:
    from tornado.locks import Condition
except ImportError:  # pragma: no cover
    from toro import Condition

from collections import deque


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

        :raises StreamingException:
            if stream has been closed, it will raise StreamingException
        """
        raise NotImplementedError()

    def close(self):
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

    @tornado.gen.coroutine
    def read(self):
        if self.state != StreamState.completed and len(self._stream) == 0:
            yield self._condition.wait()

        chunk = ""
        while len(self._stream) > 0 and len(chunk) < common.MAX_PAYLOAD_SIZE:
            chunk += self._stream.popleft()

        raise tornado.gen.Return(chunk)

    @tornado.gen.coroutine
    def write(self, chunk):
        if self.state == StreamState.completed:
            raise StreamingException("Stream has been closed.")
        if chunk:
            self._stream.append(chunk)
            self._condition.notify()

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

    @tornado.gen.coroutine
    def read(self):
        if self.state == StreamState.completed or self._rpipe is None:
            raise tornado.gen.Return("")

        chunk = ""
        try:
            chunk = yield self._rs.read_bytes(
                common.MAX_PAYLOAD_SIZE, partial=True)

        except StreamClosedError:
            # reach the end of the pipe stream
            self.state = StreamState.completed
        finally:
            raise tornado.gen.Return(chunk)

    @tornado.gen.coroutine
    def write(self, chunk):
        assert self._wpipe is not None
        try:
            yield self._ws.write(chunk)
        except StreamClosedError:
            self.state = StreamState.completed
            raise StreamingException("Stream has been closed.")

    def close(self):
        self.state = StreamState.completed
        if self._ws and self.auto_close:
            self._ws.close()

        if self._rs and self.auto_close:
            self._rs.close()
