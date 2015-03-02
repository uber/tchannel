from __future__ import absolute_import


class Context(object):
    """Represent a context.

    This includes metadata such as message ID.
    """
    __slots__ = (
        'message_id',
        'message',
    )

    def __init__(self, message_id, message):
        self.message_id = message_id
        self.message = message
