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


class TChannelException(Exception):
    """Represent a TChannel-generated exception."""
    pass


class ProtocolException(TChannelException):
    """Represent a protocol-level exception"""
    pass


class InvalidMessageException(ProtocolException):
    """Represent an invalid message."""
    pass


class InvalidEndpointException(ProtocolException):
    """Represent an message containing invalid endpoint."""
    pass


class TimeoutException(TChannelException):
    pass


class ConnectionClosedException(TChannelException):
    pass


class ReadException(TChannelException):
    """Raised when there is an error while reading input."""
    pass


class InvalidChecksumException(TChannelException):
    """Represent invalid checksum type in the message"""
    pass


class StreamingException(TChannelException):
    """Represent Streaming Message Exception"""
    pass


class InvalidErrorCodeException(TChannelException):
    """Represent Invalid Error Code exception"""
    def __init__(self, code):
        super(InvalidErrorCodeException, self).__init__(
            'Invalid Error Code (%s)' % (code))
        self.code = code


class TChannelApplicationException(TChannelException):
    """The remote application returned an exception.

    This is not a protocol error. This means a response was received with the
    ``code`` flag set to fail.
    """
    def __init__(self, code, args):
        super(TChannelException, self).__init__(
            'TChannel application error (%s)' % (args)
        )

        self.code = code
        self.args = args
