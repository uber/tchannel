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

from contextlib import contextmanager
from textwrap import dedent

import pytest

try:
    from sh import thrift
except ImportError:
    thrift = None


@contextmanager
def get_service_module(root, tornado=False):
    if not thrift:
        pytest.skip('Thrift is not installed.')

    thrift_file = root.join('service.thrift')
    thrift_file.write(dedent("""
        union Value {
            1: string stringValue
            2: i32 integerValue
        }

        struct Item {
            1: string key
            2: Value value
        }

        exception ItemAlreadyExists {
            1: Item item
        }

        exception ItemDoesNotExist {
            1: string key
        }

        service Service {
            oneway void putItemAsync(1: Item item);
            void putItem(1: Item item, 2: bool failIfPresent)
                 throws (1: ItemAlreadyExists alreadyExists);
            Item getItem(1: string key)
                 throws (1: ItemDoesNotExist doesNotExist);
        }
    """))
    with root.as_cwd():
        options = 'py:new_style,utf8strings,dynamic'
        if tornado:
            options += ',tornado'
        thrift('-out', '.', '--gen', options, str(thrift_file))
        yield root.join('service', 'Service.py').pyimport()
