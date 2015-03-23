from __future__ import absolute_import

import socket

import pytest


class _MockConnection(object):
    def __init__(self):
        self.buff = bytearray()

    def write(self, payload, callback=None):
        self.buff.extend(payload)

    def getvalue(self):
        return self.buff


@pytest.fixture
def connection():
    """Make a mock connection."""
    return _MockConnection()


@pytest.fixture
def unused_port():
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(('', 0))
    return sock.getsockname()[1]

