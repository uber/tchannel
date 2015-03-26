from __future__ import absolute_import


class BaseMessage(object):
    """Represent common functionality across all TChannel messages."""
    message_type = None

    __slots__ = ()

    def __eq__(self, other):
        if other is None:
            return False
        return all(
            getattr(self, attr) == getattr(other, attr)
            for attr in self.__slots__
        )

    def __str__(self):
        attrs = [
            "%s=%s" % (attr, str(getattr(self, attr)))
            for attr in self.__slots__
        ]

        return "%s(%s)" % (
            str(self.__class__.__name__),
            ", ".join(attrs)
        )

    def encode(self):
        """ Encode all the strings in the msg using
        encode type from common.py
        """
        pass

    def decode(self):
        """ Decode all the strings in the msg using
        decode type from common.py
        """
        pass
