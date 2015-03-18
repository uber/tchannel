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
