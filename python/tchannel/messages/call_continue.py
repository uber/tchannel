from __future__ import absolute_import

from .types import Types
from .. import rw
from . import common, ChecksumType
from .base import BaseMessage


class CallContinueMessage(BaseMessage):
    """Represent a continuation of a call request (across multiple frames)."""
    max_args_num = 3

    __slots__ = (
        'flags',
        'checksum',
        'args',
    )

    def __init__(
        self,
        flags=0,
        checksum=None,
        args=None,
    ):
        self.flags = flags
        if checksum is not None:
            checksum = common.ChecksumType.standardize(checksum)
        self.checksum = checksum or \
            (common.ChecksumType.none, None)

        self.args = args or []

    def encode(self):
        self.args = list(map(
            lambda arg: self.encode_str(arg),
            self.args))

    def decode(self):
        self.args = list(map(
            lambda arg: self.decode_str(arg),
            self.args))

    def fragment(self, space_left, fragment_msg):
        """Streaming Message got fragmented based on
        payload size. All the data within space_left
        will be kept. All the rest will be shifted to
        next fragment message.

        :param space_left: space left for current frame
        :param fragment_msg: the type is either
        CallRequestMessage or CallResponseMessage


        :return: None if there is space left
        or next fragment message
        """
        new_args = []
        for i, arg in enumerate(self.args):
            if space_left >= 2: # 2bytes for size
                space_left -= 2

                if arg is not None:
                    arg_length = len(arg)
                    if space_left < arg_length:
                        fragment_msg.args.append(arg[space_left+1:])
                        new_args.append(arg[:space_left])
                        space_left = 0
                    else:
                        new_args.append(arg)
                        space_left -= arg_length
                        if space_left <= 2:
                            # boundary for arg
                            fragment_msg.args.append("")
                else:
                    new_args.append(arg)
            else:
                for l in range(i, len(self.args)):
                    fragment_msg.args.append(self.args[l])
                break

        self.args = new_args
        if space_left >= 0 and len(fragment_msg.args) == 0:
            # don't need to fragment any more
            self.flags = 0x00
            return None
        else:
            self.flags = 0x01
            return fragment_msg

