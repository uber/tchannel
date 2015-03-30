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

from collections import namedtuple

from thrift import Thrift
from thrift.protocol import TProtocol, TBinaryProtocol, fastbinary

from .transport import TChannelTransportBase


class TChannelProtocolFramed(TProtocol.TProtocolBase, object):

    # These functions will just be delegated to self._binary.
    #
    # Generally, these won't be called because generated code that uses the
    # 'dynamic' option will call readStruct/writeStruct, both of which will
    # call fastbinary. However, there are still things like
    # TApplicationException that use these functions instead. So, they will
    # delegate to the standard TBinaryProtocol implementation.
    __delegate_to_binary__ = (
        'writeMessageEnd', 'writeStructBegin', 'writeStructEnd',
        'writeFieldBegin', 'writeFieldEnd', 'writeFieldStop', 'writeMapBegin',
        'writeMapEnd', 'writeListBegin', 'writeListEnd', 'writeSetBegin',
        'writeSetEnd', 'writeBool', 'writeByte', 'writeI16', 'writeI32',
        'writeI64', 'writeDouble', 'writeString', 'readMessageEnd',
        'readStructBegin', 'readStructEnd', 'readFieldBegin', 'readFieldEnd',
        'readMapBegin', 'readMapEnd', 'readListBegin', 'readListEnd',
        'readSetBegin', 'readSetEnd', 'readBool', 'readByte', 'readI16',
        'readI32', 'readI64', 'readDouble', 'readString'
    )

    class __metaclass__(type):  # Custom metaclasses? For shame!

        @staticmethod
        def make_delegate(name):

            def delegate(self, *args, **kwargs):
                return getattr(self._binary, name)(*args, **kwargs)

            delegate.__name__ = name
            return delegate

        def __new__(mcs, name, bases, dct):

            # Generate delegate methods for everything specified in
            # __delegate_to_binary__
            if '__delegate_to_binary__' in dct:
                for name in dct['__delegate_to_binary__']:
                    dct[name] = mcs.make_delegate(name)

            return type.__new__(mcs, name, bases, dct)

    def __init__(self, service_name, transport):
        """Build a new TChannelProtocol.

        :param service_name:
            Name of the Thrift service to which the requests are being made.
            Note: This is NOT the name of the TChannel service (passed as
            ``service~1``). This is the name of the ``service`` specified in
            the Thrift IDL.
        """
        super(TChannelProtocolFramed, self).__init__(transport)

        # We don't always have control over the Transport. For Tornado
        # clients, this class will be instantiated with a TMemoryBuffer as the
        # transport.

        self.transport = transport
        self.service_name = service_name

        # For when the manual struct read-write code path is called by things
        # like TApplicationException.
        self._binary = TBinaryProtocol.TBinaryProtocol(self.transport)

    def _endpoint(self, name):
        return "%s::%s" % (self.service_name, name)

    def _method_name(self, endpoint):
        # TODO: Assert that service name matches?
        return endpoint.split('::', 1)[1]

    def writeMessageBegin(self, name, ttype, seqid):
        return self._binary.writeMessageBegin(
            self._endpoint(name), ttype, seqid
        )

    def readMessageBegin(self):
        (endpoint, ttype, seqid) = self._binary.readMessageBegin()
        return (self._method_name(endpoint), ttype, seqid)

    def writeStruct(self, obj, thrift_spec):
        return self.transport.write(
            fastbinary.encode_binary(obj, (obj.__class__, thrift_spec))
        )

    def readStruct(self, obj, thrift_spec):
        return fastbinary.decode_binary(
            obj, self.transport, (obj.__class__, thrift_spec)
        )


class TChannelProtocol(TChannelProtocolFramed):
    """Facilitates Thrift calls via TChannel."""

    def __init__(self, service_name, transport):
        assert isinstance(transport, TChannelTransportBase), (
            "TChannelProtocol can only be used with transports based on "
            "TChannelTransportBase. Use TChannelProtocolFramed for other "
            "transports. Note that the two protocols have different "
            "over-the-wire representations."
        )
        super(TChannelProtocol, self).__init__(service_name, transport)

    def writeMessageBegin(self, name, ttype, seqid):
        # TODO: Figure out other message types
        assert ttype == Thrift.TMessageType.CALL

        self.transport.init_call(self._endpoint(name), seqid)

    def readMessageBegin(self):
        (endpoint, seqid) = self.transport.recv_call()
        # TODO exceptions
        return (self._method_name(endpoint), Thrift.TMessageType.REPLY, seqid)


class TChannelProtocolFactory(TProtocol.TProtocolFactory,
                              namedtuple('_Factory', 'service_name')):
    """A Factory to construct TChannelProtocol objects.

    :param service_name:
        Name of the Thrift service to which the requests are being made. Note:
        This is NOT the name of the TChannel service (passed as
        ``service~1``). This is the name of the ``service`` specified in the
        Thrift IDL.
    """

    def getProtocol(self, transport):
        if isinstance(transport, TChannelTransportBase):
            return TChannelProtocol(self.service_name, transport)
        else:
            return TChannelProtocolFramed(self.service_name, transport)
