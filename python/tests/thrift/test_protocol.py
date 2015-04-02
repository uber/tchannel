# Copyright (c) 2015 Uber Technologies, Inc.
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in
# all copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
# THE SOFTWARE.

from __future__ import absolute_import

from tchannel.thrift import protocol as tproto
from tchannel.thrift import transport as ttrans

from thrift import Thrift
from thrift.transport.TTransport import TMemoryBuffer

from doubles import allow, expect
from hypothesis import given, assume, specifiers

# A strategy for generating Thrift message types (a value between 1 and 4).
TMessageType = specifiers.sampled_from([
    Thrift.TMessageType.CALL,
    Thrift.TMessageType.REPLY,
    Thrift.TMessageType.EXCEPTION,
    Thrift.TMessageType.ONEWAY,
])


seqid = specifiers.integers_in_range(0, 1000)


@given(str, TMessageType, seqid)
def test_framed(method, ttype, seqid):
    """When using the Framed protocol, message information must be readable
    across writes.
    """
    assume(len(method) > 0)

    write_buffer = TMemoryBuffer()
    proto = tproto.TChannelProtocolFramed('FooService', write_buffer)
    proto.writeMessageBegin(method, ttype, seqid)
    proto.writeMessageEnd()

    read_buffer = TMemoryBuffer(write_buffer.getvalue())
    proto = tproto.TChannelProtocolFramed('FooService', read_buffer)
    assert (method, ttype, seqid) == proto.readMessageBegin()
    proto.readMessageEnd()


@given(str, seqid)
def test_unframed(method, seqid):
    assume(len(method) > 0)

    transport_cls = type('SomeTransport', (ttrans.TChannelTransportBase,), {})
    transport = transport_cls('localhost:4040', 'foo')
    proto = tproto.TChannelProtocol('FooService', transport)

    expect(transport).init_call.with_args('FooService::' + method, seqid)
    proto.writeMessageBegin(method, Thrift.TMessageType.CALL, seqid)
    proto.writeMessageEnd()

    allow(transport).recv_call.and_return(('FooService::' + method, seqid))
    assert (
        method, Thrift.TMessageType.REPLY, seqid
    ) == proto.readMessageBegin()
    proto.readMessageEnd()
