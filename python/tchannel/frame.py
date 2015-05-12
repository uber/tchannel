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

from . import rw
from .errors import ReadError
from .io import BytesIO

FrameHeader = namedtuple('FrameHeader', 'message_type message_id')
Frame = namedtuple('Frame', 'header payload')


class FrameReadWriter(rw.ReadWriter):

    # ReadWriter for Frame size
    size_rw = rw.number(2)  # size:2

    # ReadWriter for FrameHeaders
    header_rw = rw.instance(
        FrameHeader,
        ('message_type', rw.number(1)),             # type:1
        (rw.skip, rw.constant(rw.number(1), 0)),    # reserved:1
        ('message_id', rw.number(4)),               # id:4
        (rw.skip, rw.constant(rw.number(8), 0)),    # reserved:8
    )

    def read(self, stream, size=None):
        if not size:
            try:
                size = self.size_rw.read(stream)
            except ReadError:
                return None
        if not size:
            return None

        body = self.take(stream, size - self.size_rw.width())

        header_width = self.header_rw.width()
        header_body, payload = body[:header_width], body[header_width:]

        header = self.header_rw.read(BytesIO(header_body))
        return Frame(header, payload)

    def write(self, frame, stream):
        prelude_size = self.size_rw.width() + self.header_rw.width()
        size = prelude_size + len(frame.payload)

        self.size_rw.write(size, stream)
        self.header_rw.write(frame.header, stream)
        stream.write(frame.payload)

        return stream

    def width(self):
        return self.size_rw.width() + self.header_rw.width()

frame_rw = FrameReadWriter()
