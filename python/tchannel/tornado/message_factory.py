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

import logging

from ..errors import InvalidChecksumError
from ..errors import ProtocolError
from ..errors import StreamingError
from ..messages import RW
from ..messages import Types
from ..messages import common
from ..messages.call_continue import CallContinueMessage
from ..messages.call_request import CallRequestMessage
from ..messages.call_request_continue import CallRequestContinueMessage
from ..messages.call_response import CallResponseMessage
from ..messages.call_response_continue import CallResponseContinueMessage
from ..messages.common import CHECKSUM_MSG_TYPES
from ..messages.common import FlagsType
from ..messages.common import StreamState
from ..messages.common import Tracing
from ..messages.common import generate_checksum
from ..messages.common import verify_checksum
from ..messages.error import ErrorMessage
from ..zipkin.annotation import Endpoint
from ..zipkin.trace import Trace
from .request import Request
from .response import Response
from .stream import InMemStream

log = logging.getLogger('tchannel')


def build_raw_error_message(protocol_exception):
    """build protocol level error message based on Error object"""
    message = ErrorMessage(
        code=protocol_exception.code,
        tracing=Tracing(
            protocol_exception.tracing.span_id,
            protocol_exception.tracing.parent_span_id,
            protocol_exception.tracing.trace_id,
            protocol_exception.tracing.traceflags),
        description=protocol_exception.description,
    )

    return message


def build_protocol_exception(message, message_id=None):
    """build protocol level error message based on Error object"""

    error = ProtocolError(
        code=message.code,
        description=message.description,
        id=message_id,
    )

    return error


class MessageFactory(object):
    """Provide the functionality to decompose and recompose
    streaming messages.
    """

    def __init__(self, remote_host=None, remote_host_port=None):
        # key: message_id
        # value: incomplete streaming messages
        self.message_buffer = {}
        self.remote_host = remote_host
        self.remote_host_port = remote_host_port

        self.in_checksum = {}
        self.out_checksum = {}

    def build_raw_request_message(self, request, args, is_completed=False):
        """build protocol level message based on request and args.

        request object contains meta information about outgoing request.
        args are the currently chunk data from argstreams
        is_completed tells the flags of the message

        :param request: Request
        :param args: array of arg streams
        :param is_completed: message flags
        :return: CallRequestMessage/CallRequestContinueMessage
        """
        request.flags = FlagsType.none if is_completed else FlagsType.fragment

        # TODO decide what need to pass from request
        if request.state == StreamState.init:
            message = CallRequestMessage(
                flags=request.flags,
                # ttl=request.ttl,
                tracing=Tracing(request.tracing.span_id,
                                request.tracing.parent_span_id,
                                request.tracing.trace_id,
                                request.tracing.traceflags),
                service=request.service,
                headers=request.headers,
                checksum=request.checksum,
                args=args
            )
            request.state = (StreamState.completed if is_completed
                             else StreamState.streaming)
        elif request.state == StreamState.streaming:
            message = CallRequestContinueMessage(
                flags=request.flags,
                checksum=request.checksum,
                args=args
            )
            request.state = (StreamState.completed if is_completed
                             else StreamState.streaming)
        else:
            raise StreamingError("request state Error")

        message.id = request.id
        return message

    def build_raw_response_message(self, response, args, is_completed=False):
        """build protocol level message based on response and args.

        response object contains meta information about outgoing response.
        args are the currently chunk data from argstreams
        is_completed tells the flags of the message

        :param response: Response
        :param args: array of arg streams
        :param is_completed: message flags
        :return: CallResponseMessage/CallResponseContinueMessage
        """
        response.flags = FlagsType.none if is_completed else FlagsType.fragment

        # TODO decide what need to pass from request
        if response.state == StreamState.init:
            message = CallResponseMessage(
                flags=response.flags,
                code=response.code,
                tracing=Tracing(response.tracing.span_id,
                                response.tracing.parent_span_id,
                                response.tracing.trace_id,
                                response.tracing.traceflags),
                headers=response.headers,
                checksum=response.checksum,
                args=args
            )
            response.state = (StreamState.completed if is_completed
                              else StreamState.streaming)
        elif response.state == StreamState.streaming:
            message = CallResponseContinueMessage(
                flags=response.flags,
                checksum=response.checksum,
                args=args
            )
            response.state = (StreamState.completed if is_completed
                              else StreamState.streaming)
        else:
            raise StreamingError("response state Error")

        message.id = response.id
        return message

    def build_raw_message(self, reqres, args, is_completed=False):
        if isinstance(reqres, Request):
            return self.build_raw_request_message(reqres, args, is_completed)
        elif isinstance(reqres, Response):
            return self.build_raw_response_message(reqres, args, is_completed)
        else:
            raise StreamingError("context object type error")

    def prepare_args(self, message):
        args = [
            InMemStream(auto_close=False),
            InMemStream(auto_close=False),
            InMemStream(auto_close=False),
        ]
        for i, arg in enumerate(message.args):
            if i > 0:
                args[i - 1].close()
            args[i].write(arg)

        return args

    def build_request(self, message):
        """Build request object from protocol level message info

        It is allowed to take incompleted CallRequestMessage. Therefore the
        created request may not contain whole three arguments.

        :param message: CallRequestMessage
        :return: request object
        """

        args = self.prepare_args(message)

        tracing = Trace(
            trace_id=message.tracing.trace_id,
            span_id=message.tracing.span_id,
            parent_span_id=message.tracing.parent_id,
            endpoint=Endpoint(self.remote_host,
                              self.remote_host_port,
                              message.service),
            traceflags=message.tracing.traceflags
        )

        # TODO decide what to pass to Request from message
        req = Request(
            flags=message.flags,
            # ttl=message.ttl,
            tracing=tracing,
            service=message.service,
            headers=message.headers,
            checksum=message.checksum,
            argstreams=args,
            id=message.id,
        )
        return req

    def build_response(self, message):
        """Build response object from protocol level message info

        It is allowed to take incompleted CallResponseMessage. Therefore the
        created request may not contain whole three arguments.

        :param message: CallResponseMessage
        :return: response object
        """

        args = self.prepare_args(message)

        # TODO decide what to pass to Response from message
        res = Response(
            flags=message.flags,
            code=message.code,
            headers=message.headers,
            checksum=message.checksum,
            argstreams=args,
            id=message.id,
        )
        return res

    def build_context(self, message):
        if message.message_type == Types.CALL_REQ:
            return self.build_request(message)
        elif message.message_type == Types.CALL_RES:
            return self.build_response(message)
        else:
            raise StreamingError("invalid message type: %s" %
                                 message.message_type)

    def build(self, message):
        """buffer all the streaming messages based on the
        message id. Reconstruct all fragments together.

        :param message:
            incoming message
        :return: next complete message or None if streaming
            is not done
        """
        context = None

        if message.message_type in [Types.CALL_REQ,
                                    Types.CALL_RES]:
            self.verify_message(message)

            context = self.build_context(message)
            # streaming message
            if message.flags == common.FlagsType.fragment:
                self.message_buffer[message.id] = context

            # find the incompleted stream
            num = 0
            for i, arg in enumerate(context.argstreams):
                if arg.state != StreamState.completed:
                    num = i
                    break

            self.close_argstream(context, num)
            return context

        elif message.message_type in [Types.CALL_REQ_CONTINUE,
                                      Types.CALL_RES_CONTINUE]:
            context = self.message_buffer.get(message.id)
            if context is None:
                # missing call msg before continue msg
                raise StreamingError(
                    "missing call message after receiving continue message")

            # find the incompleted stream
            dst = 0
            for i, arg in enumerate(context.argstreams):
                if arg.state != StreamState.completed:
                    dst = i
                    break

            try:
                self.verify_message(message)
            except InvalidChecksumError as e:
                context.argstreams[dst].set_exception(e)
                raise

            src = 0
            while src < len(message.args):
                context.argstreams[dst].write(message.args[src])
                dst += 1
                src += 1

            if message.flags != FlagsType.fragment:
                # get last fragment. mark it as completed
                assert (len(context.argstreams) ==
                        CallContinueMessage.max_args_num)
                self.message_buffer.pop(message.id, None)
                context.flags = FlagsType.none

            self.close_argstream(context, dst - 1)
            return None
        elif message.message_type == Types.ERROR:
            context = self.message_buffer.pop(message.id, None)
            if context is None:
                log.warn('Unconsumed error %s', context)
                return None
            else:
                protocol_exception = build_protocol_exception(message)
                protocol_exception.tracing = context.tracing

                context.set_exception(protocol_exception)
                return protocol_exception
        else:
            return message

    def fragment(self, message):
        """Fragment message based on max payload size

        note: if the message doesn't need to fragment,
        it will return a list which only contains original
        message itself.

        :param message: raw message
        :return: list of messages whose sizes <= max
            payload size
        """
        if message.message_type in [Types.CALL_RES,
                                    Types.CALL_REQ,
                                    Types.CALL_REQ_CONTINUE,
                                    Types.CALL_RES_CONTINUE]:
            rw = RW[message.message_type]
            payload_space = (common.MAX_PAYLOAD_SIZE -
                             rw.length_no_args(message))
            # split a call/request message into an array
            # with a call/request message and {0~n} continue
            # message
            fragment_msg = message.fragment(payload_space)
            self.generate_checksum(message)

            yield message
            while fragment_msg is not None:
                message = fragment_msg
                rw = RW[message.message_type]
                payload_space = (common.MAX_PAYLOAD_SIZE -
                                 rw.length_no_args(message))
                fragment_msg = message.fragment(payload_space)
                self.generate_checksum(message)
                yield message
        else:
            yield message

    def generate_checksum(self, message):
        if message.message_type not in CHECKSUM_MSG_TYPES:
            return
        generate_checksum(
            message,
            self.out_checksum.get(message.id, 0),
        )

        self.out_checksum[message.id] = message.checksum[1]
        if message.flags == FlagsType.none:
            self.out_checksum.pop(message.id)

    def verify_message(self, message):
        """Verify the checksum of the message."""
        if verify_checksum(
                message,
                self.in_checksum.get(message.id, 0),
        ):
            self.in_checksum[message.id] = message.checksum[1]

            if message.flags == FlagsType.none:
                self.in_checksum.pop(message.id)
        else:
            self.in_checksum.pop(message.id, None)
            raise InvalidChecksumError("Checksum does not match!")

    @staticmethod
    def close_argstream(request, num):
        # close the stream for completed args since we have received all
        # the chunks
        if request.flags == FlagsType.none:
            num += 1

        for i in range(num):
            request.argstreams[i].close()

    def remove_buffer(self, message_id):
        self.message_buffer.pop(message_id, None)

    def set_inbound_exception(self, protocol_error):
        reqres = self.message_buffer.get(protocol_error.id)
        if reqres is None:
            # missing call msg before continue msg
            raise StreamingError(
                "missing call message after receiving continue message")

        # find the incompleted stream
        dst = 0
        for i, arg in enumerate(reqres.argstreams):
            if arg.state != StreamState.completed:
                dst = i
                break

        reqres.argstreams[dst].set_exception(protocol_error)

        self.message_buffer.pop(protocol_error.id, None)
