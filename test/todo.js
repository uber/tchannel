// Copyright (c) 2015 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

'use strict';

var test = require('tape');

test('forwarding a 80kb payload');
test('calling connections for non-existant service');
test('calling connections with exit nodes down');
test('register two services on one hostPort fails');
test('send register to entry who is also exit');
test('creating a logger');
test('forwarding a call response not ok');
test('forwarding a error frame from a service');
test('sending a message to autobahn with empty service');
test('sending an unknown arg1 to autobahn for service autobahn');
test('calling the repl_port endpoint');
test('sending corrupted json to autobahn arg2');
test('sending corrupted json to autobahn arg3');
test('decrement k by a set value');
test('advertising during a restart does not error');
