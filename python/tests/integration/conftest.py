from __future__ import absolute_import

import socket

import pytest

from tests.integration.server_manager import ServerManager


@pytest.yield_fixture
def server_manager(random_open_port):
    with ServerManager(random_open_port) as manager:
        yield manager


@pytest.fixture
def random_open_port():
    """Find and return a random open TCP port."""
    sock = socket.socket(socket.AF_INET)
    try:
        sock.bind(('', 0))
        return sock.getsockname()[1]
    finally:
        sock.close()
