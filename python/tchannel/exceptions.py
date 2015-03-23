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


class TimeoutException(TChannelException):
    pass


class TChannelApplicationException(TChannelException):
    """The remote application returned an exception.

    This is not a protocol error. This means a response was received with the
    ``code`` flag set to fail."""
    def __init__(self, code, arg_1, arg_2, arg_3):
        super(TChannelException, self).__init__(
            'TChannel application error (%s, %s, %s)' % (arg_1, arg_2, arg_3)
        )

        self.code = code
        self.arg_1 = arg_1
        self.arg_2 = arg_2
        self.arg_3 = arg_3
