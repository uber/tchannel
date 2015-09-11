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
var util = require('util');

var Larch = require('../../lib/larch/larch');
var BaseBackend = require('../../lib/larch/base-backend');

function FakeBackend(options) {
    if (!(this instanceof FakeBackend)) {
        return new FakeBackend(options);
    }
    this.logs = [];
    this.bootstrapped = false;
    this.destroyed = false;
}

util.inherits(FakeBackend, BaseBackend);

FakeBackend.prototype.log = function log(record, cb) {
    this.logs.push(record);

    if (typeof cb === 'function') {
        cb();
    }
};

FakeBackend.prototype.bootstrap = function bootstrap(cb) {
    this.bootstrapped = true;
    cb();
};

FakeBackend.prototype.destroy = function destroy(cb) {
    this.destroyed = true;
    cb();
};

test('larch with single backend uses logSingleBackend', function t1(assert) {
    var backend = FakeBackend();

    var logger = Larch({backends: [backend]});

    assert.ok(
        logger.log === logger.logSingleBackend,
        'logger is using logSingleBackend'
    );

    logger.bootstrap();
    assert.ok(backend.bootstrapped, 'backend was bootstrapped');

    logger.error('test', {foo: 'bar'});

    var jsonRecord = backend.logs[0].toJSON();
    delete jsonRecord.time;

    assert.deepEqual(
        jsonRecord,
        {foo: 'bar', message: 'test', level: 'error'},
        'log backend gets message'
    );

    logger.destroy();
    assert.ok(backend.destroyed, 'backend was destroyed');

    assert.end();
});

test('larch with muiltple backends uses logMultiBackend', function t2(assert) {
    var backend = FakeBackend();
    var backend2 = FakeBackend();

    var logger = Larch({backends: [backend, backend2]});

    assert.ok(
        logger.log === logger.logMultiBackend,
        'logger is using logSingleBackend'
    );

    logger.error('test', {foo: 'bar'});

    var jsonRecord = backend.logs[0].toJSON();
    delete jsonRecord.time;

    assert.deepEqual(
        jsonRecord,
        {foo: 'bar', message: 'test', level: 'error'},
        'log backend gets message'
    );

    var jsonRecord2 = backend2.logs[0].toJSON();
    delete jsonRecord2.time;

    assert.deepEqual(
        jsonRecord2,
        {foo: 'bar', message: 'test', level: 'error'},
        'log backend 2 gets message'
    );

    assert.end();
});
