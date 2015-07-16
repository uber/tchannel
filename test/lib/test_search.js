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

var extend = require('xtend');
var EventEmitter = require('events').EventEmitter;
var series = require('run-series');
var tape = require('tape');
var util = require('util');

function TestSearch(options) {
    if (!(this instanceof TestSearch)) {
        return new TestSearch(options);
    }
    var self = this;
    EventEmitter.call(self);
    self.options = options;
    if (self.options.init) self.init = self.options.init;
    if (self.options.test) self.test = self.options.test;
    if (self.options.next) self.next = self.options.next;
    if (self.options.describeState) self.describeState = self.options.describeState;
    if (self.options.willFailLike) self.willFailLike = self.options.willFailLike;
    if (!self.options.maxTries) self.options.maxTries = 1;
    self.searching = false;
    self.ran = null;
    self.seen = null;
    self.frontier = null;
    self.pass = 0;
    self.fail = 0;
    self.failed = null;
}
util.inherits(TestSearch, EventEmitter);

TestSearch.prototype.runTestHarness = function runTestHarness() {
    var self = this;
    if (self.options.repro) {
        var state = self.options.reproState.call(self, self.options);
        tape(self.options.title + ' repro ' + self.describeState(state), function t(assert) {
            var spec = self.makeSpec(state);
            self.test(spec, assert);
            self.destroy(assert.end);
        });
    } else if (self.options.first) {
        tape(self.options.title + ' test', function t(assert) {
            var finished = false;
            series(self.options.testSettings.map(function eachOptions(options) {
                return function runThunk(next) {
                    if (finished) return next();
                    self.run(assert, options, function(err, run) {
                        if (err || run.fail) finished = true;
                        next(err);
                    });
                };
            }), function done(err) {
                assert.ifError(err, 'no final error');
                self.destroy(assert.end);
            });
        });
    } else {
        self.options.testSettings.forEach(function eachOptions(options) {
            tape(self.options.title + ': ' + JSON.stringify(options), function t(assert) {
                self.run(assert, options, done);
                function done(err) {
                    if (err) assert.ifError(err, 'no final error');
                    self.destroy(assert.end);
                }
            });
        });
    }
};

TestSearch.prototype.log = function log() {
    var self = this;
    self.emit('log', util.format.apply(null, arguments));
};

TestSearch.prototype.reset = function reset() {
    var self = this;
    self.searching = false;
    self.ran = Object.create(null);
    self.seen = Object.create(null);
    self.frontier = [];
    self.pass = 0;
    self.fail = 0;
    self.failed = [];
};

TestSearch.prototype.search = function search() {
    var self = this;

    var state = null;
    while (!state) {
        if (!self.frontier.length) {
            self.emit('done');
            return;
        }
        state = self.frontier.shift();
        var key = self.stateIdentity(state);
        if (self.shouldSkip(state)) {
            state = null;
            continue;
        }
        self.ran[key] = true;
    }

    self.runTest(state, function done(err) {
        if (err) {
            self.emit('error', err);
            return;
        }
        if (!self.searching) {
            self.emit('done');
            return;
        }
        setImmediate(self.search.bind(self));
    });
};

TestSearch.prototype.makeResult = function makeResult(state) {
    return {
        state: state,
        passed: true,
        pass: 0,
        fail: 0,
        startTime: null,
        endTime: null,
        elapsedHRtime: [0, 0],
        results: []
    };
};

TestSearch.prototype.runTest = function runTest(state, done) {
    var self = this;
    var number = 1;
    round(maybeRetry);

    function round(callback) {
        var assert = new tape.Test();
        var result = self.makeResult(state);
        assert.on('result', function onCaseResult(res) {
            if (typeof res !== 'object') return; // e.g. comment strings
            result.results.push(res);
            if (res.ok) result.pass++;
            else result.fail++;
        });
        assert.once('end', function testDone() {
            result.endTime = process.hrtime();
            result.elapsedHRtime = hrtimeDiff(result.startTime, result.endTime);
            result = self.augmentResult(result);
            self.emit('testEnd', result);
            callback(result);
        });
        result.startTime = process.hrtime();
        self.test.call(self, state, assert);
    }

    function maybeRetry(result) {
        if (!result.passed && ++number <= self.options.maxTries) {
            setTimeout(function() {
                round(maybeRetry);
            }, 5);
        } else {
            finish(result);
        }
    }

    function finish(result) {
        self.handleTestResult(result);
        done();
    }
};

TestSearch.prototype.handleTestResult = function handleTestResult(result) {
    var self = this;
    self.expand(self.next.bind(self, result.state));
    self.result(result);
};

TestSearch.prototype.stop = function stop() {
    var self = this;
    self.searching = false;
};

TestSearch.prototype.describeState =
TestSearch.prototype.stateIdentity = function stateIdentity(state) {
    return JSON.stringify(state);
};

TestSearch.prototype.isStateEqual = function isStateEqual(a, b) {
    var self = this;
    return self.stateIdentity(a) === self.stateIdentity(b);
};

TestSearch.prototype.hasSimilarFailed = function result(state) {
    var self = this;
    var rel = self.willFailLike || self.isStateEqual;
    for (var i = 0; i < self.failed.length; i++) {
        if (rel.call(self, state, self.failed[i])) {
            return true;
        }
    }
    return false;
};

TestSearch.prototype.shouldIgnoreResult = function shouldSkipResult(res) {
    var self = this;
    if (res.fail && self.hasSimilarFailed(res.state)) return true;
    return false;
};

TestSearch.prototype.augmentResult = function augmentResult(res) {
    if (res.fail) res.passed = false;
    return res;
};

TestSearch.prototype.result = function result(res) {
    var self = this;
    if (self.shouldIgnoreResult(res)) {
        self.emit('ignore', res);
    } else {
        self.emit('result', res);
    }
};

TestSearch.prototype.shouldSkip = function shouldSkip(state) {
    var self = this;
    var key = self.stateIdentity(state);
    if (self.ran[key]) return true;
    if (self.isPruned(state)) return true;
    return false;
};

TestSearch.prototype.shouldAdd = function shouldAdd(state) {
    var self = this;
    var key = self.stateIdentity(state);
    if (self.seen[key]) return true;
    if (self.isPruned(state)) return true;
    return false;
};

TestSearch.prototype.isPruned = function isPruned(state) {
    var self = this;
    if (self.hasSimilarFailed(state)) return true;
    return false;
};

TestSearch.prototype.expand = function expand(func) {
    var self = this;
    var c = 0;
    func.call(self, function emit() {
        for (var i = 0; i < arguments.length; i++) {
            var next = arguments[i];
            if (!self.shouldAdd(next)) {
                self.seen[self.stateIdentity(next)] = true;
                self.frontier.push(next);
                c++;
            }
        }
    });
    return c;
};

TestSearch.prototype.reportResult = function reportResult(res, assert) {
    var self = this;
    var i;
    if (self.options.verbose) {
        assert.comment(self.describeState(res.state));
        for (i = 0; i < res.results.length; i++) {
            assert.emit('result', res.results[i]);
        }
    } else {
        if (res.passed) {
            if (!self.options.silentPass) {
                assert.pass(self.describeState(res.state));
            }
        } else {
            for (i = 0; i < res.results.length; i++) {
                assert.emit('result', res.results[i]);
            }
            if (self.options.first) {
                self.stop();
            }
        }
    }
};

TestSearch.prototype.report = function report(assert) {
    var self = this;

    if (self.options.silentPass && !self.fail) {
        assert.pass('all ' + self.pass + ' cases passed');
    }
};

TestSearch.prototype.run = function run(assert, options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = null;
    }

    var self = Object.create(this);
    self.options = extend(self.options, options);
    self.reset();
    process.nextTick(start);
    return self;

    function start() {
        self.once('error', finish);
        self.once('done', finish);
        self.on('result', onResult);
        self.on('log', onLog);
        if (self.init) self.init();
        self.searching = true;
        self.search();
    }

    function finish(err) {
        if (!err) self.report(assert);
        self.removeListener('error', finish);
        self.removeListener('done', finish);
        self.removeListener('result', onResult);
        self.removeListener('log', onLog);
        if (callback) {
            callback(err, self);
        } else {
            assert.end(err);
        }
    }

    function onResult(res) {
        if (res.passed) {
            self.pass++;
        } else {
            self.fail++;
            self.failed.push(res.state);
        }
        self.reportResult(res, assert);
    }

    function onLog(mess) {
        assert.comment(mess);
    }
};

TestSearch.prototype.destroy = function destroy(callback) {
    callback(null);
};

function hrtimeDiff(a, b) {
    return [b[0] - a[0], (1e9 + b[1] - a[1]) % 1e9];
}

module.exports = TestSearch;
