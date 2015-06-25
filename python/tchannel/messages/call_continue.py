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

from . import common
from .base import BaseMessage
from .common import FlagsType


class CallContinueMessage(BaseMessage):
    """Represent a continuation of a call request (across multiple frames)."""
    max_args_num = 3

    __slots__ = BaseMessage.__slots__ + (
        'flags',
        'checksum',
        'args',
    )

    def __init__(
        self,
        flags=0,
        checksum=None,
        args=None,
        id=0,
    ):
        super(CallContinueMessage, self).__init__(id)
        self.flags = flags

        if checksum is None:
            self.checksum = (common.ChecksumType.none, None)
        else:
            self.checksum = (checksum[0], checksum[1])

        self.args = args or []

    def fragment(self, space_left, fragment_msg):
        """Streaming Message got fragmented based on
        payload size. All the data within space_left
        will be kept. All the rest will be shifted to
        next fragment message.

        :param space_left:
            space left for current frame
        :param fragment_msg:
            the type is either CallRequestMessage or
            CallResponseMessage
        :return: None if there is space left
            or next fragment message
        """
        new_args = []
        key_length = 2  # 2bytes for size
        for i, arg in enumerate(self.args):
            if space_left >= key_length:
                space_left -= key_length

                if arg is not None:
                    arg_length = len(arg)
                    if space_left < arg_length:
                        fragment_msg.args.append(arg[space_left:])
                        new_args.append(arg[:space_left])
                        space_left = 0
                    else:
                        new_args.append(arg)
                        space_left -= arg_length
                        if space_left <= key_length:
                            # boundary for arg
                            fragment_msg.args.append("")
                else:
                    new_args.append("")
            else:
                for l in range(i, len(self.args)):
                    fragment_msg.args.append(self.args[l])
                break

        self.args = new_args
        if space_left >= 0 and len(fragment_msg.args) == 0:
            # don't need to fragment any more
            return None
        else:
            self.flags = FlagsType.fragment
            fragment_msg.id = self.id
            return fragment_msg
