from __future__ import absolute_import

import pytest
import tornado.gen

from tchannel.exceptions import TimeoutException
from tchannel.tornado.timeout import timeout


@pytest.mark.gen_test
def test_timeout():

    sleep_time = 0.001

    @tornado.gen.coroutine
    def slow_method():
        yield tornado.gen.sleep(sleep_time * 2)
        raise tornado.gen.Return('foo')

    slow_future = slow_method()

    with timeout(slow_future, sleep_time):
        with pytest.raises(TimeoutException):
            yield slow_future
