from __future__ import absolute_import


class BaseMessage(object):
    """Represent common functionality across all TChannel messages."""
    message_type = None

    def parse(self, payload, size):
        """Parse a payload into a message.

        This is defined by bytes 16 and above of the message body, e.g. after
        the size and flags have been parsed.

        Payload may be ``None`` if size is 0.
        """
        raise NotImplementedError()

    def serialize(self, out):
        """Serialize a message to its wire format.

        ``out`` is generally a ``bytearray`` which is a mutable sequence of
        bytes.

        This generates the ``payload`` section of the message.
        """
        raise NotImplementedError()
