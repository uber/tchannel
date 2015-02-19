from __future__ import absolute_import
from tchannel.frame import Frame
from tchannel.parser import read_number


class _FakeMessage(object):
    message_type = 0x30

    def serialize(self, out):
        """Serialize 0-bytes to ``out``."""
        return


def test_empty_message(connection, stringio):
    """Verify size is set properly for an empty message."""
    message_id = 42
    frame = Frame(
        message=_FakeMessage(),
        message_id=message_id,
    )

    frame.write(connection)

    value = stringio(connection.getvalue())

    assert read_number(value, 4) == frame.PRELUDE_SIZE
