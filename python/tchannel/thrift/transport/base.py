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


class TChannelTransportBase(TTransport.TTransportBase, object):

    def __init__(self, tchannel, hostport, service_name):
        self._tchannel = tchannel
        self._hostport = hostport
        self._service_name = service_name

        self._wbuf = BytesIO()
        self._seqid = None
        self._endpoint = None

    # Connection open/close is managed by TChannel

    def isOpen(self):
        return True

    def open(self):
        pass

    def close(self):
        pass

    def write(self, buf):
        assert self._endpoint, 'init_call must be called first'
        self._wbuf.write(buf)

    def init_call(self, endpoint, seqid):
        """Inform the transport that the next call will be to the given
        endpoint and has the specified seqid.

        :param endpoint:
            Name of the endpoint being called. Note that for Thrift, this must
            be in the format ``<thriftServiceName>::<methodName>`` where
            ``thriftServiceName`` is the name of the Thrift service (specified
            under ``service`` in the IDL) and ``methodName`` is the name of
            the method being called.
        :param seqid:
            Thrift's identifier for the call number.
        """
        assert endpoint, 'endpoint cannot be None or empty'
        self._endpoint = endpoint
        self._seqid = seqid

    def recv_call(self):
        return (self._endpoint, self._seqid)
