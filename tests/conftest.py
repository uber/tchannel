from __future__ import absolute_import
try:
    from cStringIO import StringIO
except ImportError:
    from io import BytesIO as StringIO

import pytest


class _MockConnection(object):
    def __init__(self):
        self.buff = bytearray()

    def write(self, payload):
        self.buff.extend(payload)

    def getvalue(self):
        return self.buff


@pytest.fixture
def connection():
    """Make a mock connection."""
    return _MockConnection()


@pytest.fixture
def stringio():
    return StringIO
