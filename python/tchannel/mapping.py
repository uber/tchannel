from __future__ import absolute_import

from .messages import ALL_MESSAGES
MESSAGE_TYPES_TO_CLASSES = {
    msg.message_type: msg
    for msg in ALL_MESSAGES
}


def get_message_class(message_type):
    """Map a message type identifier to a message class."""
    return MESSAGE_TYPES_TO_CLASSES.get(message_type)
