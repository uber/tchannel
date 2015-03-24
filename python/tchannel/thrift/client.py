from __future__ import absolute_import

import os
import sys

from tchannel.io import BytesIO

from thrift import Thrift
from thrift.protocol import TProtocol
from thrift.protocol import TBinaryProtocol
from thrift.transport import TTransport

from thrift.protocol import fastbinary
# TODO maybe hanlde the case where fastbinary is not available?

from ..outgoing import OutgoingTChannel


class TChannelTransport(
    TTransport.CReadableTransport, TTransport.TTransportBase, object
):
    """A Thrift transport to send requests over an open TChannel connection.

    Provides access to the current message ID and method name via the
    ``message_id`` and ``method_name`` attributes.
    """

    def __init__(self, client_ops, service_name):
        """Initialize the TChannelTransport.

        :param client_ops:
            A ClientOperation-like object used to make outgoing requests. This
            must provide the method ``send(arg1, arg2, arg3)``.
        :param service_name:
            Name of the Thrift service. Note: This is NOT the name of the
            TChannel service (passed as ``service~1``). This is the name of
            the service specified in the Thrift IDL.
        """
        self._rbuf = BytesIO()
        self._wbuf = BytesIO()

        self._client_ops = client_ops
        self._service_name = service_name

        self.message_id = None
        self.method_name = None

    # Connection open/close is managed by TChannel

    def isOpen(self):
        return True

    def open(self):
        pass

    def close(self):
        pass

    def read(self, sz):
        return self._rbuf.read(sz)

    def begin_message(self, name):
        """Notify the transport of a new request.

        This must be called with the name of the remote method being called.
        """
        self.method_name = name
        self._wbuf = BytesIO()

    def write(self, buf):
        assert self.method_name, 'begin_message must be called first'
        self._wbuf.write(buf)

    def flush(self):
        assert self.method_name, 'begin_message must be called first'
        payload = self._wbuf.getvalue()
        self._wbuf = BytesIO()  # avoid buffer leaking between requests

        # TODO: Headers support
        message = self._client_ops.send(self._endpoint, '', payload)

        self.message_id = self._client_ops.message_id
        # TODO: Also read the headers?
        self._rbuf = BytesIO(message.arg_3)

    @property
    def _endpoint(self):
        """Name of the remote endpoint being called.

        This is the name the Thrift service and the method name separated by
        two colons."""
        return "%s::%s" % (self._service_name, self.method_name)

    # Implement the CReadableTransport interface. Can't read from this
    # transport from `fastbinary` without it.

    @property
    def cstringio_buf(self):
        return self._rbuf

    def cstringio_refill(self, partialread, reqlen):
        want = reqlen - len(partialread)
        if want > 0:
            partialread += self._rbuf.read(want)
        if len(partialread) != reqlen:
            raise EOFError()
        else:
            return BytesIO(partialread)


class TChannelProtocol(TProtocol.TProtocolBase, object):
    """Allows using TChannel to send Thrift requests."""

    # These functions will just be delegated to self._binary.
    #
    # Generally, these won't be called because generated code that uses the
    # 'dynamic' option will call readStruct/writeStruct, both of which will
    # call fastbinary. However, there are still things like
    # TApplicationException that use these functions instead. So, they will
    # delegate to the standard TBinaryProtocol implementation.
    __delegate_to_binary__ = (
        'writeStructBegin', 'writeStructEnd', 'writeFieldBegin',
        'writeFieldEnd', 'writeFieldStop', 'writeMapBegin', 'writeMapEnd',
        'writeListBegin', 'writeListEnd', 'writeSetBegin', 'writeSetEnd',
        'writeBool', 'writeByte', 'writeI16', 'writeI32', 'writeI64',
        'writeDouble', 'writeString', 'readStructBegin', 'readStructEnd',
        'readFieldBegin', 'readFieldEnd', 'readMapBegin', 'readMapEnd',
        'readListBegin', 'readListEnd', 'readSetBegin', 'readSetEnd',
        'readBool', 'readByte', 'readI16', 'readI32', 'readI64', 'readDouble',
        'readString'
    )

    # The default instance of TChannel that the requests will be sent through.
    _default_tchannel = None

    class __metaclass__(type):  # Metaclasses? For shame!

        def __new__(mcs, name, bases, dct):
            for name in dct['__delegate_to_binary__']:
                def delegate(self, *args, **kwargs):
                    return getattr(self._binary, name)(*args, **kwargs)

                delegate.__name__ = name
                dct[name] = delegate
            return type.__new__(mcs, name, bases, dct)

    @classmethod
    def get_default_tchannel(cls):
        """Get a default TChannel instance to send the requests through."""
        if not cls._default_tchannel:
            cls._default_tchannel = OutgoingTChannel(
                '%s[%d]' % (sys.argv[0], os.getpid())
            )
        return cls._default_tchannel

    def __init__(self, service, host_port, tchannel=None):
        """Set up TChannelProtocol to communicate with the given host.

        :param service:
            Name of the Thrift service being called. This is the name
            specified for the service in the Thrift IDL. The remote service
            registered the service methods under this name.
        :param host_port:
            String in the form ``<host>:<port>`` specifying the remote host.
        :param tchannel:
            If given, this is the TChannel object through which the requests
            will be made. If omitted, a default TChannel object will be
            constructed and used.
        """
        assert service, "service is required"
        assert host_port, "host_port is required"

        self.service = service
        self.tchannel = tchannel or self.get_default_tchannel()

        # This sets self.trans
        super(TChannelProtocol, self).__init__(
            TChannelTransport(
                self.tchannel.request(host_port),
                self.service,
            )
        )

        # In case fastbinary is not available or old code path is called by
        # things like TApplicationException
        self._binary = TBinaryProtocol.TBinaryProtocol(self.trans)

    def writeMessageBegin(self, name, ttype, seqid):
        # TODO Exceptions support
        assert ttype == Thrift.TMessageType.CALL
        self.trans.begin_message(name)

    def writeMessageEnd(self):
        pass  # Don't need to do anything

    def writeStruct(self, obj, thrift_spec):
        return self.trans.write(
            fastbinary.encode_binary(obj, (obj.__class__, thrift_spec))
        )

    def readMessageBegin(self):
        # TODO Exceptions support
        return (
            self.trans.method_name,
            Thrift.TMessageType.REPLY,
            self.trans.message_id,
        )

    def readMessageEnd(self):
        pass  # Don't need to do anything

    def readStruct(self, obj, thrift_spec):
        return fastbinary.decode_binary(
            obj, self.trans, (obj.__class__, thrift_spec)
        )
