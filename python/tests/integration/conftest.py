from __future__ import absolute_import

import socket

import pytest

from tests.integration.server_manager import TCPServerManager
from tests.integration.server_manager import TChannelServerManager


@pytest.yield_fixture
def tcp_server(random_open_port):
    with TCPServerManager(random_open_port) as manager:
        yield manager


@pytest.yield_fixture
def tchannel_server(random_open_port):
    with TChannelServerManager(random_open_port) as manager:
        yield manager


@pytest.yield_fixture(
    params=[TCPServerManager, TChannelServerManager]
)
def server(request, random_open_port):
    """Run a test against TChannel and TCP.

    This only works in combination with `@pytest.mark.gen_test`.
    """
    manager_class = request.param
    with manager_class(random_open_port) as manager:
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
