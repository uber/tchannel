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
var EgressNode = require('../../hyperbahn/egress-nodes');
var EventEmitter = require('../../lib/event_emitter');

test('set default k value works', function (assert) {
    var ringpop = new EventEmitter();
    ringpop.membershipChangedEvent = ringpop.defineEvent('membershipChanged');
    var node = new EgressNode({
        ringpop: ringpop,
        defaultKValue: 10
    });

    assert.equals(node.defaultKValue, 10, 'default value initialized');
    node.setDefaultKValue(11);
    assert.equals(node.defaultKValue, 11, 'default value gets updated');
    assert.end();
});

test('set wrong default k', function (assert) {
    var ringpop = new EventEmitter();
    ringpop.membershipChangedEvent = ringpop.defineEvent('membershipChanged');
    var node = new EgressNode({
        ringpop: ringpop,
        defaultKValue: 10
    });

    assert.throws(function wrongKValue() {
        node.setDefaultKValue(-1);
    });
    assert.end();
});
