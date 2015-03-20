import pytest

from tchannel.tornado import TChannel


@pytest.fixture
def dummy_tchannel():
    return TChannel()


def dummy_endpoint(header, body, opts):
    pass


def test_dispatch(dummy_tchannel):
    tchannel = dummy_tchannel
    tchannel.register_handler(
        r"/hello",
        dummy_endpoint
    )

    @tchannel.route(r"/")
    def dummy_endpoint1(header, body, opts):
        pass

    endpoint = tchannel.dispatch_request("/hello")
    assert endpoint["handler"] == dummy_endpoint

    endpoint = tchannel.dispatch_request("/")
    assert endpoint["handler"] == dummy_endpoint1
