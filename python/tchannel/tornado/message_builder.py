from ..messages import Types


class MessageBuilder(object):

    ARGS = ["arg_1", "arg_2", "arg_3"]

    def __init__(self):
        """key: message_id
           value: incomplete messages
        """
        self.message_buffer = {}

    @staticmethod
    def _get_cur_pending_arg(message):
        cur_arg = 0
        if message.arg_3 != "":
            cur_arg = 2
        elif message.arg_2 != "":
            cur_arg = 1
        print "cur_arg" + str(cur_arg)
        return cur_arg

    def compose_map(self, call_msg):
        cur_arg = self._get_cur_pending_arg(call_msg)

        arg_map = {"arg_1": "",
                   "arg_2": "",
                   "arg_3": ""}
        t = 0

        for i in range(cur_arg, 3):
            arg_map[self.ARGS[i]] = self.ARGS[t]
            t += 1

        return arg_map

    def build(self, message_id, message):

        if message.message_type is Types.CALL_REQ or\
           message.message_type is Types.CALL_RES:
            if message.flags == 0x01:  # streaming message
                message.flags = 0x00
                self.message_buffer[message_id] = message
                return None
        elif message.message_type is Types.CALL_REQ_CONTINUE or\
                message.message_type is Types.CALL_RES_CONTINUE:
            call_msg = self.message_buffer.get(message_id)
            if call_msg is None:
                # missing call msg before continue msg
                raise Exception()

            arg_map = self.compose_map(call_msg)
            call_msg.arg_1 += getattr(message, arg_map["arg_1"], "")
            call_msg.arg_2 += getattr(message, arg_map["arg_2"], "")
            call_msg.arg_3 += getattr(message, arg_map["arg_3"], "")

            # last fragment
            if message.flags == 0x00:
                self.message_buffer.pop(message_id, None)
                return call_msg
            else:
                return None

        return message
