from __future__ import absolute_import
from os import urandom


def big_arg():
    LARGE_AMOUNT = 64 * 1024 * 5
    return urandom(LARGE_AMOUNT)
