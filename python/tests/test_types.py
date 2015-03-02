from __future__ import absolute_import

from tchannel.messages.types import Types


def test_type_sanity():
    """Simple check to make sure types are importable."""
    assert Types.INIT_REQ == 1
