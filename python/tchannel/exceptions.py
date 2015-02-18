from __future__ import absolute_import


class TChannelException(Exception):
    """Represent a TChannel-generated exception."""
    pass


class ProtocolException(TChannelException):
    """Represent a protocol-level exception"""
    pass


class InvalidMessageException(ProtocolException):
    """Represent an invalid message."""
    pass
