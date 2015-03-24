from __future__ import absolute_import

import pytest
import tornado.gen

from tchannel.exceptions import TimeoutException
from tchannel.tornado.timeout import timeout


@pytest.mark.gen_test
def test_timeout(io_loop):

    sleep_time = 0.01

    @tornado.gen.coroutine
    def slow_method():
        yield tornado.gen.sleep(sleep_time * 10)
        raise tornado.gen.Return('foo')

    slow_future = slow_method()

    with pytest.raises(TimeoutException):
        with timeout(slow_future, sleep_time, io_loop):
            yield slow_future
