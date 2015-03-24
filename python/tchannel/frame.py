from __future__ import absolute_import

import logging
from collections import namedtuple

from . import rw
from .io import BytesIO
from .exceptions import ReadException

log = logging.getLogger('tchannel')


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
            except ReadException:
                return None
        if not size:
            return None

        body = self.take(stream, size - self.size_rw.width())

        header_width = self.header_rw.width()
        header_body, payload = body[:header_width], body[header_width:]

        header = self.header_rw.read(BytesIO(header_body))
        log.debug('decode frame for message %s', header.message_id)
        return Frame(header, payload)

    def write(self, frame, stream):
        prelude_size = self.size_rw.width() + self.header_rw.width()
        size = prelude_size + len(frame.payload)

        self.size_rw.write(size, stream)
        self.header_rw.write(frame.header, stream)
        log.debug("writing frame for message %s", frame.header.message_id)
        stream.write(frame.payload)

        return stream

    def width(self):
        return self.size_rw.width() + self.header_rw.width()

frame_rw = FrameReadWriter()
