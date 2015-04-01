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

from thrift.transport import TTransport

from tchannel.io import BytesIO
from .base import TChannelTransportBase


class TChannelTransport(TTransport.CReadableTransport, TChannelTransportBase):
    """A Thrift transport to send requests over an synchronous TChannel
    connection.

    .. code-block:: python

        transport = TChannelTransport(tchannel, host_port, 'foo_service')

        transport.init_call('FooService::doBar', seqid)
        transport.write('request body')
        transport.flush()

        (endpoint, seqid) = transport.recv_call()
        transport.read(10)

    Note: This transport is NOT thread-safe.
    """

    def __init__(self, tchannel, hostport, service_name):
        """Initialize the TChannelTransport.

        :param tchannel:
            TChannel through which outgoing requests will be made.
        :param hostport:
            String in the form ``host:port`` containing information abouth the
            destination server.
        :param service_name:
            Name of the TChannel service (passed as ``service~1`` in the
            protocol). This is not necessarily the same as the Thrift service
            name.
        """
        super(TChannelTransport, self).__init__(
            tchannel, hostport, service_name
        )

        self._rbuf = BytesIO()

    def read(self, sz):
        return self._rbuf.read(sz)

    def flush(self):
        assert self._endpoint, 'init_call must be called first'

        payload = self._wbuf.getvalue()
        self._wbuf = BytesIO()  # avoid buffer leaking between requests

        response = self._tchannel.request(
            self._hostport, self._service_name
        ).send(
            self._endpoint,
            '',  # TODO: headers
            payload,
        )

        # TODO: Headers
        self._rbuf = BytesIO(response.args[2])
        # Since this transport will be used for synchronous calls only, we
        # don't need to worry about out-of-order responses. That's taken care
        # of by TChannel.

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
