from ..messages import Types
from ..exceptions import StreamingException
from ..messages.common import FlagsType
from ..messages.call_continue import CallContinueMessage


class MessageFactory(object):

    # 64KB Max frame size
    # 16B (size:2 | type:1 | reserved:1 | id:4 | reserved:8)
    # 1 2 Bytes can represent 0~64KB-1
    MAX_PAYLOAD_SIZE = 64*1024 - 16 - 1

    def __init__(self):
        """key: message_id
           value: incomplete messages
        """
        self.message_buffer = {}

    def build(self, message_id, message):
        """buffer all the streaming messages based on the
        message id. Reconstruct all fragments together.

        :param message_id: id
        :param message: incoming message
        :return: next complete message or None
        """
        if message.message_type in [Types.CALL_REQ,
                                    Types.CALL_RES]:
            if message.flags == 0x01:  # streaming message
                message.flags = 0x00
                self.message_buffer[message_id] = message
                return None
        elif message.message_type in [Types.CALL_REQ_CONTINUE,
                                      Types.CALL_RES_CONTINUE]:
            call_msg = self.message_buffer.get(message_id)
            if call_msg is None:
                # missing call msg before continue msg
                raise StreamingException()

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
                call_msg.decode()
                return call_msg
            else:
                return None
            message.decode()
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
        fragments = []

        if message.message_type in [Types.CALL_RES,
                                    Types.CALL_REQ]:
            for i in range(len(message.args)):
                if message.args[i] is None:
                    message.args[i] = ""

            message.encode()

            payload_space = self.MAX_PAYLOAD_SIZE -\
                message.get_meta_size()
            fragment_msg = message.fragment(payload_space)
            fragments.append(message)
            while fragment_msg is not None:
                message = fragment_msg
                payload_space = self.MAX_PAYLOAD_SIZE -\
                    message.get_meta_size()
                fragment_msg = message.fragment(payload_space)
                fragments.append(message)
        else:
            message.encode()
            fragments.append(message)

        return fragments
