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

from ..messages import Types, RW
from ..exceptions import StreamingException
from ..messages.common import FlagsType
from ..messages.call_continue import CallContinueMessage
from ..messages import common


class MessageFactory(object):
    """Provide the functionality to decompose and recompose
    streaming messages.
    """

    # 64KB Max frame size
    # 16B (size:2 | type:1 | reserved:1 | id:4 | reserved:8)
    # 1 2 Bytes can represent 0~2**16-1
    MAX_PAYLOAD_SIZE = 0xFFEF   # 64*1024 - 16 - 1

    def __init__(self):
        # key: message_id
        # value: incomplete streaming messages
        self.message_buffer = {}

    def build(self, message_id, message):
        """buffer all the streaming messages based on the
        message id. Reconstruct all fragments together.

        :param message_id:
            id
        :param message:
            incoming message
        :return: next complete message or None if streaming
            is not done
        """
        if message.message_type in [Types.CALL_REQ,
                                    Types.CALL_RES]:
            # streaming message
            if message.flags == common.FlagsType.fragment:
                message.flags = common.FlagsType.none
                self.message_buffer[message_id] = message
                return None
        elif message.message_type in [Types.CALL_REQ_CONTINUE,
                                      Types.CALL_RES_CONTINUE]:
            call_msg = self.message_buffer.get(message_id)
            if call_msg is None:
                # missing call msg before continue msg
                raise StreamingException(
                    "missing call message after receiving" +
                    "continue message")

            dst = len(call_msg.args) - 1
            src = 0
            while src < len(message.args):
                if dst < len(call_msg.args):
                    call_msg.args[dst] += message.args[src]
                else:
                    call_msg.args.append(message.args[src])

                dst += 1
                src += 1

            # check if this is last fragment
            if message.flags != FlagsType.fragment:
                assert len(call_msg.args) == CallContinueMessage.max_args_num

                self.message_buffer.pop(message_id, None)
                return call_msg
            else:
                return None
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
                                    Types.CALL_REQ]:

            rw = RW[message.message_type]
            payload_space = (self.MAX_PAYLOAD_SIZE -
                             rw.length_no_args(message))
            # split a call/request message into an array
            # with a call/request message and {0~n} continue
            # message
            fragment_msg = message.fragment(payload_space)
            yield message
            while fragment_msg is not None:
                message = fragment_msg
                rw = RW[message.message_type]
                payload_space = (self.MAX_PAYLOAD_SIZE -
                                 rw.length_no_args(message))
                fragment_msg = message.fragment(payload_space)
                yield message
        else:
            yield message
