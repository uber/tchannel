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


class TChannelError(Exception):
    """Represent a TChannel-generated exception."""
    pass


class ProtocolError(TChannelError):
    """Represent a protocol-level exception"""
    __slots__ = (
        'code',
        'description',
        'id',
        'tracing',
    )

    def __init__(
        self,
        code,
        description,
        id=None,
        tracing=None,
    ):
        super(TChannelError, self).__init__(description)
        self.code = code
        self.tracing = tracing
        self.id = id
        self.description = description


class InvalidMessageError(TChannelError):
    """Represent an invalid message."""
    pass


class InvalidEndpointError(TChannelError):
    """Represent an message containing invalid endpoint."""
    pass


class TimeoutError(TChannelError):
    pass


class ConnectionClosedError(TChannelError):
    pass


class ReadError(TChannelError):
    """Raised when there is an error while reading input."""
    pass


class InvalidChecksumError(TChannelError):
    """Represent invalid checksum type in the message"""
    pass


class StreamingError(TChannelError):
    """Represent Streaming Message Exception"""
    pass


class NoAvailablePeerError(TChannelError):
    """Represent Error that TChannel can't find available peer for request"""
    pass


class InvalidErrorCodeError(TChannelError):
    """Represent Invalid Error Code exception"""
    def __init__(self, code):
        super(InvalidErrorCodeError, self).__init__(
            'Invalid Error Code (%s)' % (code))
        self.code = code


class TChannelApplicationError(TChannelError):
    """The remote application returned an exception.

    This is not a protocol error. This means a response was received with the
    ``code`` flag set to fail.
    """
    def __init__(self, code, args):
        super(TChannelError, self).__init__(
            'TChannel application error (%s)' % (args)
        )

        self.code = code
        self.args = args
