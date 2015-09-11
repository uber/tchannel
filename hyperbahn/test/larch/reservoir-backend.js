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
var Timer = require('time-mock');

var ReservoirBackend = require('../../lib/larch/reservoir-backend');
var Record = require('../../lib/larch/record');

var FakeBackend = require('../lib/fake-backend');

test('ReservoirBackend correctly limits logs', function t1(assert) {
    function fakeRangeRand(lo, hi) {
        return 0;
    }

    var backend = FakeBackend();
    var timer = Timer(0);

    var reservoir = ReservoirBackend({
        backend: backend,
        size: 5,
        timers: timer,
        rangeRand: fakeRangeRand
    });

    reservoir.bootstrap(noop);

    assert.ok(backend.bootstrapped, 'backend was bootstrapped');

    reservoir.log(new Record('error', 'timed out', {}));
    reservoir.log(new Record('error', 'timed out', {}));
    reservoir.log(new Record('error', 'timed out', {}));
    reservoir.log(new Record('error', 'timed out', {}));
    reservoir.log(new Record('error', 'timed out', {}));
    reservoir.log(new Record('warn', 'thing failed', {}));

    timer.advance(50);

    assert.ok(reservoir.records.length === 0, 'reservoir was flushed');
    assert.ok(backend.logs.length === 5, 'only 5 logs got through to backend');

    assert.ok(
        backend.logs[0].data.message === 'thing failed',
        'logs[0] is right'
    );
    assert.ok(
        backend.logs[1].data.message === 'timed out',
        'logs[1] is right'
    );
    assert.ok(
        backend.logs[2].data.message === 'timed out',
        'logs[2] is right'
    );
    assert.ok(
        backend.logs[3].data.message === 'timed out',
        'logs[3] is right'
    );
    assert.ok(
        backend.logs[4].data.message === 'timed out',
        'logs[4] is right'
    );

    assert.end();
});

function noop() {}
