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

from .errors import InvalidChecksumError
from .errors import StreamingError
from .messages import ErrorCode
from .messages import PingResponseMessage
from .messages import Types


class RequestHandler(object):
    """Specifies how a TChannel server handles incoming requests.

    This class is agnostic of whether specific implementations are synchronous
    or Tornado-based.
    """

    def handle(self, message, connection):
        """Handle an incoming request.

        The handshake has already been completed.

        :param message:
            the incoming message.
        :param connection:
            Reference to the connection object
        :returns:
            Nothing. The connection object must be used to send the response
            back.
        """
        raise NotImplementedError()


class BaseRequestHandler(RequestHandler):
    """A minimal RequestHandler skeleton.

    This implements a minimal base RequestHandler that implements methods
    which should be mostly the same between implementations. Implementations
    must inherit this class and override at least ``handle_call``.
    """

    _HANDLER_NAMES = {
        Types.PING_REQ: 'ping',
        Types.CALL_REQ: 'pre_call',
        Types.CALL_REQ_CONTINUE: 'pre_call'
    }

    def __init__(self):
        super(BaseRequestHandler, self).__init__()

    def handle(self, message, connection):
        # TODO assert that the handshake was already completed
        assert message, "message must not be None"

        if message.message_type not in self._HANDLER_NAMES:
            # TODO handle this more gracefully
            raise NotImplementedError("Unexpected message: %s" % str(message))

        handler_name = "handle_" + self._HANDLER_NAMES[message.message_type]
        return getattr(self, handler_name)(message, connection)

    def handle_pre_call(self, message, connection):
        """Handle incoming request message including CallRequestMessage and
        CallRequestContinueMessage

        This method will build the User friendly request object based on the
        incoming messages.

        It passes all the messages into the message_factory to build the init
        request object. Only when it get a CallRequestMessage and a completed
        arg_1=argstream[0], the message_factory will return a request object.
        Then it will trigger the async call_handle call.

        :param message: CallRequestMessage or CallRequestContinueMessage
        :param connection: tornado connection
        """
        try:
            req = connection.request_message_factory.build(message)
            # message_factory will create Request only when it receives
            # CallRequestMessage. It will return None, if it receives
            # CallRequestContinueMessage.
            if req:
                self.handle_call(req, connection)

        except (InvalidChecksumError, StreamingError) as e:
            connection.send_error(
                ErrorCode.bad_request,
                e.message,
                message.id,
            )
        except Exception:
            connection.send_error(
                ErrorCode.unexpected,
                "An unexpected error has occurred.",
                message.id,
            )

    def handle_ping(self, ping, connection):
        return connection.write(PingResponseMessage(), ping.id)

    def handle_call(self, call, connection):
        """Handle an incoming call.

        :param call:
            CallRequestMessage containing information about the call
        :param connection:
            Connection through which the call was made
        :returns:
            Nothing. The response must be sent using the
            implementation-specific connection object.
        """
        raise NotImplementedError("Must be implemented.")


class CallableRequestHandler(RequestHandler):
    """An adapter from a function to a RequestHandler."""

    def __init__(self, f):
        assert f
        self._f = f

    def handle(self, message, connection):
        return self._f(message, connection)
