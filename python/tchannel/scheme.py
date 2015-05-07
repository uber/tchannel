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

import json


class ArgScheme(object):
    """ArgScheme defines interface on how to serialize/deserialize
    header and body.

    Customized ArgScheme subclass must implement all methods::

        def type()

        def serialize_header(obj)

        def deserialize_header(obj)

        def serialize_body(obj)

        def deserialize_body(obj)
    """
    def type(self):
        raise NotImplementedError()

    def serialize_header(self, obj):
        raise NotImplementedError()

    def deserialize_header(self, obj):
        raise NotImplementedError()

    def serialize_body(self, obj):
        raise NotImplementedError()

    def deserialize_body(self, obj):
        raise NotImplementedError()


class JsonArgScheme(ArgScheme):
    _type = 'json'

    def type(self):
        return self._type

    def deserialize_header(self, obj):
        if not obj:
            return None
        return json.loads(obj)

    def serialize_header(self, obj):
        return json.dumps(obj)

    def deserialize_body(self, obj):
        if not obj:
            return None
        return json.loads(obj)

    def serialize_body(self, obj):
        return json.dumps(obj)


class RawArgScheme(ArgScheme):
    _type = "raw"

    def type(self):
        return self._type

    def deserialize_header(self, obj):
        return obj

    def serialize_header(self, obj):
        return obj

    def deserialize_body(self, obj):
        return obj

    def serialize_body(self, obj):
        return obj
