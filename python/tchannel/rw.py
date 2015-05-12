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

import struct

from .errors import ReadError

skip = '_'


def none():
    """A ReadWriter that consumes nothing and returns None."""
    return NoneReadWriter()


def constant(rw, value):
    """A ReadWriter that runs the given ReadWriter and ignores the value.

    Always writes and returns ``value`` instead.

    :param rw:
        ReadWriter to run
    :param value:
        Value to serialize and return
    """
    return ConstantReadWriter(rw, value)


def number(width_bytes):
    """Build a ReadWriter for integers of the given width.

    :param width_bytes:
        Width of the integer. One of 1, 2, 4 and 8.
    """
    return NumberReadWriter(width_bytes)


def args(length_rw):
    """Build a ReadWriter for args=[arg1, arg2, arg3]

    :param length_rw:
        ReadWriter for the length of each arg
    """
    return ArgsReaderWriter(length_rw)


def len_prefixed_string(length_rw, is_binary=False):
    """Build a ReadWriter for strings prefixed with their length.

    .. code-block:: python

        len_prefixed_string(number(2))  # == str~2

    :param length_rw:
        ReadWriter for the length of the string
    :param is_binary:
        Whether the string is a binary blob. If this is False (the default),
        the string will be encoded/decoded to UTF-8 before writing/reading.
    """
    return LengthPrefixedBlobReadWriter(length_rw, is_binary)


def chain(*rws):
    """Build a ReadWriter from the given list of ReadWriters.

    .. code-block:: python

        chain(
            number(1),
            number(8),
            len_prefixed_string(number(2)),
        )  # == n1:1 n2:8 s~2

    Reads/writes from the given ReadWriters in-order. Returns lists of values
    in the same order as the ReadWriters.

    :param rws:
        One or more ReadWriters
    """
    assert rws is not None
    if len(rws) == 1 and isinstance(rws[0], list):
        # In case someone does chain([l0, l1, ...])
        rws = rws[0]
    return ChainReadWriter(rws)


def dictionary(*pairs):
    """Build a ReadWriter that reads/writes dictionaries.

    ``pairs`` are tuples containing field names and their corresponding
    ReadWriters. The fields will be read and written in the same order
    provided here.

    For example the following ReadWriter will read and write dictionaries in
    the form ``{"flags": <byte>, "id": <int32>}``.

    .. code-block:: python

        dictionary(
            ("flags", number(1)),
            ("id", number(4)),
        )

    For pairs where the key name is `rw.skip`, the value will not be saved and
    the serializer will receive None.

    :param pairs:
        One or more tuples in the from ``(<field name>, <ReadWriter>)``.
    """
    return NamedChainReadWriter(pairs)


def instance(cls, *pairs):
    """Build a ReadWriter that reads/writes intances of the given class.

    ``pairs`` are key-value pairs that specify constructor argument names and
    their corresponding ReadWriters. These same names are used to access
    attributes on instances when writing.


    .. code-block:: python

        instance(
            Person,
            ("name", len_prefixed_string(number(2))),
            ("age", number(1))
        )

    For pairs where the attribute name is `rw.skip`, the value will not be
    passed to the constructor. Further, while serializing, None will be passed
    to the serializer.

    :param cls:
        A class with an ``__init__`` method accepting keyword arguments for
        all items specified in ``pairs``
    :param pairs:
        Key-value pairs mapping argument name to ReadWriter.
    """
    return InstanceReadWriter(cls, pairs)


def headers(length_rw, key_rw, value_rw=None):
    """Build a ReadWriter for header lists.

    A header is represented as::

        count:L (key:K value:V){count}

    The value produced is a list of key-value pairs. For example,

    .. code-block:: python

        headers(
            number(L),
            len_prefixed_string(number(K)),
            len_prefixed_string(number(V)),
        )

    :param length_rw:
        ReadWriter for the number of pairs in the header
    :param key_rw:
        ReadWriter for a key in a pair
    :param value_rw:
        ReadWriter for a value in a pair. Defaults to ``key_rw``.
    """
    return HeadersReadWriter(length_rw, key_rw, value_rw)


def switch(switch_rw, cases):
    """A ReadWriter that picks behavior based on the value of ``switch_rw``.

    .. code-block:: python

        switch(
            number(1), {
                0: option_1_rw(),
                1: option_2_rw()
            }
        )

    Produces a tuple in the from ``(switch_value, case_value)``. If a given
    switch value did not have a corresponding case, nothing will be written to
    the stream and None will be returned as the value when reading.

    :param switch_rw:
        A ReadWriter that produces a value to dispatch on
    :param cases:
        Pairs where the key is the expected value from ``switch_rw``. If the
        value matches, the corresponding ReadWriter will be executed.
    """
    return SwitchReadWriter(switch_rw, cases)


class ReadWriter(object):
    """Provides the ability to read/write types from/to file-like objects.

    ReadWrites SHOULD not maintain any state between calls to
    ``read``/``write`` and MUST be re-usable and thread-safe. The
    ``read``/``write`` methods MAY Be called on the same ReadWriter instance
    multiple times for different requests at the same time.

    The file-like stream object MUST provide ``read(int)`` and ``write(str)``
    methods with behaviors as follows:

    ``read(int)``
        MUST return the specified number of bytes from the stream. MAY return
        fewer bytes if the end of the stream was reached.
    ``write(str)``
        MUST write the given string or buffer to the stream.
    """

    def read(self, stream):
        """Read and return the object from the stream.

        :param stream:
            file-like object providing a `read(int)` method
        :returns: the deserialized object
        :raises ReadError:
            for parse errors or if the input is too short
        """
        raise NotImplementedError()

    def write(self, obj, stream):
        """Write the object to the stream.

        :param stream:
            file-like obect providing a `write(str)` method
        :returns:
            the stream
        """
        raise NotImplementedError()

    def length(self, obj):
        """Return the number of bytes will actually be written into io.

        For cases where the width depends on the input, this should return the
        length of data will be written into iostream."""
        raise NotImplementedError()

    def width(self):
        """Return the number of bytes this ReadWriter is expected to take.

        For cases where the width depends on the input, this should return the
        minimum width the ReadWriter is expected to take."""
        raise NotImplementedError()

    def take(self, stream, num):
        """Read the given number of bytes from the stream.

        :param stream:
            stream to read from
        :param num:
            number of bytes to read
        :raises ReadError:
            if the stream did not yield the exact number of bytes expected
        """
        s = stream.read(num)
        slen = len(s)
        if slen != num:
            raise ReadError(
                "Expected %d bytes but got %d bytes." % (num, slen)
            )
        return s


class DelegatingReadWriter(ReadWriter):
    """Allows mapping ReadWriters onto different types.

    A common pattern is to define a base ReadWriter using the primitives from
    this module and then map those onto custom types.

    For example, consider a Person class.

    .. code-block:: python

        Person = namedtuple('Person', 'name age')

    Given a ReadWriter that produces a ``(name, age)`` tuple, we want to map
    it to/from Person object.

    .. code-block:: python

        class PersonReadWriter(DelegatingReadWriter):
            __rw__ = # a ReadWriter that produces (name, age) tuples

            def read(self, stream):
                (name, age) = super(PersonReadWriter, self).read(stream)
                return Person(name, age)

            def write(self, person, stream):
                super(PersonReadWriter, self).write(
                    (person.name, person.age),
                    stream,
                )
    """

    # The underlying ReadWriter. All calls will be delegated to this.
    __rw__ = None

    class __metaclass__(type):

        def __new__(mcs, name, bases, dct):
            if bases != (ReadWriter,):
                # Children of this class MUST provide __rw__
                assert dct.get('__rw__'), (
                    "%s.__rw__ must be set" % name
                )
            return type.__new__(mcs, name, bases, dct)

    def read(self, stream):
        return self.__rw__.read(stream)

    def write(self, obj, stream):
        self.__rw__.write(obj, stream)
        return stream

    def width(self):
        return self.__rw__.width()

    def length(self, obj):
        return self.__rw__.length(obj)


class NumberReadWriter(ReadWriter):
    """See :py:func:`number` for documentation."""

    _FORMATS = {
        1: '>B',
        2: '>H',
        4: '>I',
        8: '>Q',
    }

    __slots__ = ('_width', '_format')

    def __init__(self, width_bytes):
        assert width_bytes in self._FORMATS, (
            "Unsupported integer width '%d'" % width_bytes
        )
        self._width = width_bytes
        self._format = self._FORMATS[width_bytes]

    def read(self, stream):
        return struct.unpack(self._format, self.take(stream, self._width))[0]

    def write(self, num, stream):
        stream.write(struct.pack(self._format, num))
        return stream

    def width(self):
        return self._width

    def length(self, obj):
        return self._width


class ArgsReaderWriter(ReadWriter):
    def __init__(self, length_rw, num=3):
        assert length_rw is not None
        self._length_rw = length_rw
        self._rw = len_prefixed_string(self._length_rw,
                                       is_binary=True)
        self.num = num

    def read(self, stream):
        args = []
        try:
            for _ in range(self.num):
                args.append(self._rw.read(stream))
        except ReadError:
            pass
        return args

    def write(self, args, stream):
        for arg in args:
            if arg is None:
                arg = ""
            self._rw.write(arg, stream)

    def width(self):
        return self.num * self._length_rw.width()

    def length(self, args):
        size = 0
        for arg in args:
            if arg is None:
                arg = ""
            size += self._rw.length(arg)

        return size


class LengthPrefixedBlobReadWriter(ReadWriter):
    """See :py:func:`len_prefixed_string` for documentation."""

    __slots__ = ('_length', '_is_binary')

    def __init__(self, length_rw, is_binary=False):
        assert length_rw is not None
        self._length = length_rw
        self._is_binary = is_binary

    def read(self, stream):
        length = self._length.read(stream)
        if length == 0:
            return ""
        else:
            blob = self.take(stream, length)
            if not self._is_binary:
                blob = blob.decode('utf-8')
            return blob

    def write(self, s, stream):
        if not self._is_binary:
            s = s.encode('utf-8')
        length = len(s)
        self._length.write(length, stream)
        stream.write(s)
        return stream

    def width(self):
        return self._length.width()

    def length(self, s):
        if not self._is_binary:
            s = s.encode('utf-8')

        return len(s) + self._length.width()


class ChainReadWriter(ReadWriter):
    """See :py:func:`chain` for documentation."""

    __slots__ = ('_links',)

    def __init__(self, links):
        assert links is not None
        self._links = tuple(links)

    def read(self, stream):
        return [link.read(stream) for link in self._links]

    def write(self, items, stream):
        assert len(items) == len(self._links)

        for item, link in zip(items, self._links):
            link.write(item, stream)
        return stream

    def width(self):
        return sum(link.width() for link in self._links)

    def length(self, items):
        assert len(items) == len(self._links)

        size = 0
        for item, link in zip(items, self._links):
            size += link.length(item)

        return size


class NamedChainReadWriter(ReadWriter):
    """See :py:func:`dictionary` for documentation."""

    __slots__ = ('_pairs',)

    def __init__(self, pairs):
        assert pairs is not None
        self._pairs = pairs

    def read(self, stream):
        result = {}
        for name, rw in self._pairs:
            try:
                value = rw.read(stream)
                if name != skip:
                    result[name] = value
            except ReadError as e:
                raise ReadError(
                    "Failed to read %s: %s" % (name, e.message)
                )
        return result

    def write(self, obj, stream):
        for name, rw in self._pairs:
            if name != skip:
                rw.write(obj[name], stream)
            else:
                rw.write(None, stream)
        return stream

    def width(self):
        return sum(rw.width() for _, rw in self._pairs)

    def length(self, obj):
        size = 0
        for name, rw in self._pairs:
            if name != skip:
                size += rw.length(obj[name])
            else:
                size += rw.length(None)
        return size


class InstanceReadWriter(ReadWriter):

    __slots__ = ('_cls', '_pairs',)

    def __init__(self, cls, pairs):
        self._pairs = pairs
        self._cls = cls

    def read(self, stream):
        kwargs = {}
        try:
            for attr, rw in self._pairs:
                value = rw.read(stream)
                if attr != skip:
                    kwargs[attr] = value
        except ReadError as e:
            raise ReadError(
                "Failed to read %s: %s" % (self._cls, e.message)
            )

        return self._cls(**kwargs)

    def write(self, obj, stream):
        for attr, rw in self._pairs:
            if attr != skip:
                value = getattr(obj, attr)
                rw.write(value, stream)
            else:
                rw.write(None, stream)
        return stream

    def width(self):
        return sum(rw.width() for _, rw in self._pairs)

    def length(self, obj):
        size = 0
        for attr, rw in self._pairs:
            if attr != skip:
                value = getattr(obj, attr)
                size += rw.length(value)
            else:
                size += rw.length(None)

        return size

    def length_no_args(self, obj):
        size = 0
        for attr, rw in self._pairs:
            if attr == "args":
                continue
            if attr != skip:
                value = getattr(obj, attr)
                size += rw.length(value)
            else:
                size += rw.length(None)

        return size


class HeadersReadWriter(ReadWriter):
    """See :py:func:`headers` for documentation."""

    __slots__ = ('_length', '_key', '_value')

    def __init__(self, length_rw, key_rw, value_rw=None):
        self._length = length_rw
        self._pair = chain(key_rw, value_rw or key_rw)

    def read(self, stream):
        count = self._length.read(stream)
        headers = []
        for i in range(count):
            headers.append(self._pair.read(stream))
        return headers

    def write(self, headers, stream):
        # In case someone does write({..}, stream)
        if isinstance(headers, dict):
            headers = headers.items()

        self._length.write(len(headers), stream)
        for pair in headers:
            self._pair.write(pair, stream)
        return stream

    def width(self):
        return self._length.width()

    def length(self, headers):
        size = 0
        if isinstance(headers, dict):
            headers = headers.items()

        size += self._length.length(len(headers))
        for pair in headers:
            size += self._pair.length(pair)

        return size


class NoneReadWriter(ReadWriter):
    def read(self, stream):
        return None

    def write(self, _, stream):
        return stream

    def width(self):
        return 0

    def length(self, obj):
        return 0


class ConstantReadWriter(ReadWriter):

    __slots__ = ('_rw', '_value')

    def __init__(self, rw, value):
        self._rw = rw
        self._value = value

    def read(self, stream):
        self._rw.read(stream)
        return self._value

    def write(self, out, stream):
        self._rw.write(self._value, stream)
        return stream

    def width(self):
        return self._rw.width()

    def length(self, obj):
        return self._rw.width()


class SwitchReadWriter(ReadWriter):

    __slots__ = ('_switch', '_cases')

    def __init__(self, switch_rw, cases_rw):
        self._switch = switch_rw
        self._cases = cases_rw

    def read(self, stream):
        k = self._switch.read(stream)

        if k in self._cases:
            v = self._cases[k].read(stream)
            return (k, v)
        else:
            return (k, None)

    def write(self, item, stream):
        k, v = item
        self._switch.write(k, stream)
        if v is not None and k in self._cases:
            self._cases[k].write(v, stream)
        return stream

    def width(self):
        return self._switch.width()

    def length(self, item):
        k, v = item
        size = 0
        size += self._switch.length(k)
        if v is not None and k in self._cases:
            size += self._cases[k].length(v)

        return size
