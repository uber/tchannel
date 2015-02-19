from __future__ import absolute_import

from .messages import InitRequestMessage
from .messages import InitResponseMessage
from .messages import CallRequestMessage
from .messages import CallResponseMessage
from .messages import PingRequestMessage
from .messages import PingResponseMessage


ALL_MESSAGES = [
    InitRequestMessage,
    InitResponseMessage,
    CallRequestMessage,
    CallResponseMessage,
    PingRequestMessage,
    PingResponseMessage,
]

MESSAGE_TYPES_TO_CLASSES = {
    msg.message_type: msg
    for msg in ALL_MESSAGES
}


def get_message(message_type):
    """Map a message type identifier to a message class."""
    return MESSAGE_TYPES_TO_CLASSES.get(message_type)
