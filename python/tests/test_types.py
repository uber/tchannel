from __future__ import absolute_import

from tchannel.types import Types


def test_type_sanity():
    """Simple check to make sure types are importable."""
    assert Types.INIT_REQ == 1
