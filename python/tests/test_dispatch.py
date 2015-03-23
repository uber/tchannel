import pytest

from tchannel.handler import TChannelRequestHandler


@pytest.fixture
def dummy_req():
    return TChannelRequestHandler()


def dummy_endpoint(request, response, opts):
    pass


def test_dispatch(dummy_req):
    req = dummy_req
    req.register_handler(
        r"/hello",
        dummy_endpoint
    )

    @req.route(r"/")
    def dummy_endpoint1(request, response, opts):
        pass

    endpoint = req._find_endpoint("/hello")
    assert endpoint.handler == dummy_endpoint

    endpoint = req._find_endpoint("/")
    assert endpoint.handler == dummy_endpoint1
