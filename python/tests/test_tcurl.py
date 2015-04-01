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

import pytest

from tchannel.tcurl import parse_args


@pytest.mark.parametrize('input,expected', [
    (   # basic case
        '--host foo --profile',
        [['foo/'], [None], [None], True]
    ),
    (   # multiple bodies, constant host/headers
        '--host foo -d 1 2',
        [['foo/', 'foo/'], ['1', '2'], [None, None], False]
    ),
    (   # repeated host and body
        '--host foo bar -d 1 2',
        [['foo/', 'bar/'], ['1', '2'], [None, None], False]
    ),
    (   # repeated host and body
        '--host foo -d 1 --headers a b',
        [['foo/', 'foo/'], ['1', '1'], ['a', 'b'], False]
    ),
])
def test_parse_args(input, expected):
    args = parse_args(input.split())
    assert list(args.host) == expected[0]
    assert list(args.body) == expected[1]
    assert list(args.headers) == expected[2]
    assert args.profile == expected[3]
