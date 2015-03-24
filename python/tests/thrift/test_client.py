from __future__ import absolute_import

import pytest
from doubles import InstanceDouble, allow

from tchannel.messages import CallResponseMessage
from tchannel.thrift.client import TChannelTransport


class TestTChannelTransport(object):

    @pytest.fixture(autouse=True)
    def setUp(self):
        self.out_ops = InstanceDouble('tchannel.outgoing.TChannelOutOps')
        self.trans = TChannelTransport(self.out_ops, 'MyService')

    def test_open_close(self):
        self.trans.open()
        assert self.trans.isOpen()
        self.trans.close()

    def test_write_without_begin(self):
        with pytest.raises(AssertionError):
            self.trans.write('hello')

    def test_flush_without_begin(self):
        with pytest.raises(AssertionError):
            self.trans.flush()

    def test_write_request(self):
        self.out_ops.message_id = 42
        allow(self.out_ops).send.with_args(
            'MyService::sendSomething',
            '',
            'my payload'
        ).and_return(CallResponseMessage(arg_3='my response'))

        self.trans.begin_message('sendSomething')
        self.trans.write('my payload')
        self.trans.flush()

        assert 'my response' == self.trans.read(1024)
