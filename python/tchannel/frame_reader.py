from __future__ import absolute_import

from .exceptions import ProtocolException
from .context import Context
from . import messages
from .io import BytesIO
from .rw import ReadException
from .frame import frame_rw, FrameHeader, Frame


class FrameReader(object):
    """Read bytes from a stream and yield messages as they come.

    This takes a ``connection`` object which is anything that supports
    ``read(num_bytes)`` and ``write(bytes_)``.

    As you iterate over the ``read()`` call, you will get back subclasses of
    :class:`tchannel.messages.base.BaseMessage` along with their frames.
    """

    def __init__(self, connection):
        self.connection = connection

    def read(self):
        """Continually read from a stream until it runs dry.

        This usually occurs when the other end of the connection closes.
        """
        while True:
            try:
                frame = frame_rw.read(self.connection)
            except ReadException as e:
                # Other side of the connection was probably closed
                raise ProtocolException(e.message)

            if not frame:
                break

            message_rw = messages.RW.get(frame.header.message_type)
            if not message_rw:
                raise ProtocolException(
                    "Unknown message type %d" % frame.header.message_type
                )

            try:
                message = message_rw.read(BytesIO(frame.payload))
            except ReadException as e:
                raise ProtocolException(e.message)

            yield Context(frame.header.message_id, message)


class FrameWriter(object):

    def __init__(self, connection):
        self.connection = connection

    def write(self, message_id, message):
        message_rw = messages.RW.get(message.message_type)
        if not message_rw:
            raise ProtocolException(
                "Unknown message type %d for '%s'" % (
                    message.message_type, str(message)
                )
            )

        payload = message_rw.write(message, BytesIO()).getvalue()
        frame = Frame(
            FrameHeader(
                message_type=message.message_type,
                message_id=message_id,
            ),
            payload
        )
        frame_rw.write(frame, self.connection)
