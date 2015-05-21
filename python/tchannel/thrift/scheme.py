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

from thrift.protocol import TBinaryProtocol
from thrift.transport import TTransport

from .. import io
from .. import rw
from .. import scheme


class ThriftArgScheme(scheme.ArgScheme):
    """Represents the ``thrift`` arg scheme.

    It requires a reference to the result type for deserialized objects.
    """

    # Used to serialize and deserialize headers.
    _headers_rw = rw.headers(
        rw.number(2),
        rw.len_prefixed_string(rw.number(2)),
        rw.len_prefixed_string(rw.number(2)),
    )

    def __init__(self, deserialize_type):
        """Initialize a new ThriftArgScheme.

        :param deserialize_type:
            Type of Thrift object contained in the body. This object will be
            deserialized from the stream.
        """
        self.deserialize_type = deserialize_type

    def type(self):
        return 'thrift'

    def serialize_header(self, headers):
        return self._headers_rw.write(headers, io.BytesIO()).getvalue()

    def deserialize_header(self, s):
        return self._headers_rw.read(io.BytesIO(s))

    def serialize_body(self, args):
        trans = TTransport.TMemoryBuffer()
        proto = TBinaryProtocol.TBinaryProtocolAccelerated(trans)
        args.write(proto)

        return trans.getvalue()

    def deserialize_body(self, s):
        trans = TTransport.TMemoryBuffer(s)
        proto = TBinaryProtocol.TBinaryProtocolAccelerated(trans)

        result = self.deserialize_type()
        result.read(proto)
        return result
