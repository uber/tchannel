from __future__ import absolute_import
import tornado.gen

from ..frame import Frame
from ..frame_reader import FrameReader
from ..io import BytesIO
from ..parser import read_number_string


class IOStreamFrameReader(FrameReader):
    """Decode data asynchronously from a ``tornado.iostream.IOStream.``"""

    @tornado.gen.coroutine
    def read(self):
        try:
            size_bytes = yield self.connection.read(Frame.SIZE_WIDTH)
        except tornado.iostream.StreamClosedError:
            return

        message_length = read_number_string(size_bytes, Frame.SIZE_WIDTH)
        chunk = yield self.connection.read(message_length - Frame.SIZE_WIDTH)

        raise tornado.gen.Return(Frame.decode(BytesIO(chunk), message_length))
