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
var util = require('util');
var TestSearch = require('./test_search');

function TestIsolateSearch(options) {
    if (!(this instanceof TestIsolateSearch)) {
        return new TestIsolateSearch(options);
    }
    var self = this;
    TestSearch.call(self, extend({
        first: false,
        trace: false,
    }, options));
    if (self.options.explore) self.explore = self.options.explore;
    if (self.options.isolate) self.isolate = self.options.isolate;
}
util.inherits(TestIsolateSearch, TestSearch);

TestIsolateSearch.prototype.setupHarness = function setupHarness() {
    var self = this;
    if (self.options.instrument !== undefined) {
        self.instrument(self.options.instrument);
    }
    TestSearch.prototype.setupHarness.call(self);
};

TestIsolateSearch.prototype.handleTestResult = function handleTestResult(result) {
    var self = this;
    if (!self.expand(self.next.bind(self, result.state, result))) {
        self.result(result);
    }
};

TestIsolateSearch.prototype.makeResult = function makeResult(state) {
    var self = this;
    var res = TestSearch.prototype.makeResult.call(self, state);
    res.report = 0;
    return res;
};

TestIsolateSearch.prototype.augmentResult = function augmentResult(res) {
    var self = this;
    res = TestSearch.prototype.augmentResult.call(self, res);
    var spec = res.state = res.state.makeResult(res);

    if (res.passed && spec.bad) {
        res.passed = false;
        for (var i = 0; i < spec.trace.length; i++) {
            if (spec.trace[i].fail) break;
        }
        res.report = i;
    }

    return res;
};

TestIsolateSearch.prototype.instrument = function instrumentSearch(verbosity) {
    var self = this;
    if (verbosity === undefined) verbosity = 1;

    self.on('ignore', function onPrune(res) {
        self.log('ignoring: ', self.describeState(res.state));
    });

    if (verbosity >= 1) {
        self.on('prune', function onPrune(state) {
            self.log('pruning: ', self.describeState(state));
        });
    }

    if (verbosity >= 2) {
        self.on('isolate', function onNarrow(spec) {
            self.log('narrowing down failure good: %s bad: %s',
                spec.good ? self.describeState(spec.good) : '--',
                self.describeState(spec.bad));
        });
    }

    if (verbosity >= 3) {
        self.on('explore', function onExplore(spec) {
            self.log('exploring: %s (%s steps so far)',
                self.describeState(spec.good),
                spec.countPass());
        });
    }

    return self;
};

TestIsolateSearch.prototype.reportResult = function reportResult(res, assert) {
    var self = this;
    var spec = res.state;
    var i;
    if (!res.passed) {
        self.log('Failure #%s: %s',
            self.fail,
            self.describeState(spec.trace[res.report].state));
        for (i = 0; i < spec.trace.length; i++) {
            if (!spec.trace[i].fail) {
                self.log('Last good at: %s', self.describeState(spec.trace[i].state));
                break;
            }
        }
    }

    if (self.options.trace) {
        for (i = spec.trace.length-1; i >= 0; i--) {
            emitStep(spec.trace.length - i, spec.trace[i]);
        }
    } else if (!res.passed) {
        for (i = 0; i < spec.trace.length; i++) {
            if (!spec.trace[i].fail) {
                emitStep(spec.trace.length - i, spec.trace[i]);
                break;
            }
        }
    }

    if (!res.passed || !self.options.first) {
        emitStep(spec.trace.length - res.report, spec.trace[res.report]);
    }

    if (!res.passed && self.options.first) self.stop();

    function emitStep(n, step) {
        if (step.fail) {
            self.log('- step %s: %s w/ %s', n,
                (step.fail ? 'FAIL' : 'PASS'),
                self.describeState(step.state));
            for (var i = 0; i < step.results.length; i++) {
                assert.emit('result', step.results[i]);
            }
        } else {
            assert.pass(util.format('- step %s: %s',
                n, self.describeState(step.state)));
        }
    }
};

TestIsolateSearch.prototype.report = function report(assert) {
    var self = this;
    if (self.fail && !self.options.first) {
        self.log('Isolated %s failures', self.failed.length);
        self.failed.forEach(function eachFail(res) {
            self.log('- %s', self.describeState(res));
            // var results = res.trace[0].results;
            // console.log(results[0]);
            // console.log(results[results.length-1]);
        });
    } else if (!self.fail && self.options.first) {
        assert.pass('no failures');
    }
};

TestIsolateSearch.prototype.next = function next(spec, result, emit) {
    var self = this;
    spec = spec.makeResult(result);
    if (!spec.bad) {
        self.emit('explore', spec);
        self.explore(spec, emit);
    } else {
        self.emit('isolate', spec);
        self.isolate(spec, emit);
    }
};


TestIsolateSearch.prototype.describeState =
TestIsolateSearch.prototype.stateIdentity = function stateIdentity(state) {
    return JSON.stringify(state.test);
};

TestIsolateSearch.prototype.makeSpec = function makeSpec(test, trace) {
    return IsolateSearchSpec(test, trace);
};

function IsolateSearchSpec(test, trace) {
    if (!(this instanceof IsolateSearchSpec)) {
        return new IsolateSearchSpec(test, trace);
    }
    var self = this;
    self.test = test;
    self.good = null;
    self.bad = null;
    self.trace = [];
    if (Array.isArray(trace)) {
        self.trace = trace;
        self._integrateNewResults(trace);
    }
}

IsolateSearchSpec.prototype.copy = function copy() {
    var self = this;
    var other = IsolateSearchSpec(self.test);
    other.good = self.good;
    other.bad = self.bad;
    other.trace = self.trace;
    return other;
};

IsolateSearchSpec.prototype.makeTest = function makeTest(test) {
    var self = this;
    var other = self.copy();
    other.test = test;
    return other;
};

IsolateSearchSpec.prototype.makeResult = function makeResult(/* ... results ... */) {
    var self = this;
    var other = self.copy();
    var res = Array.prototype.slice.call(arguments, 0);
    other.trace = res.concat(self.trace);
    other._integrateNewResults(res);
    return other;
};

IsolateSearchSpec.prototype._integrateNewResults = function _integrateNewResults(res) {
    var self = this;
    var gotGood = false;
    var gotBad = false;
    var i = 0;
    while (!(gotGood && gotBad) && i < res.length) {
        if (!gotGood && !res[i].fail) {
            self.good = res[i].state;
            gotGood = true;
        } else if (!gotBad && res[i].fail) {
            self.bad = res[i].state;
            gotBad = true;
        }
        i++;
    }
    return self;
};

IsolateSearchSpec.prototype.countPass = function countPass() {
    var self = this;
    var n = 0;
    for (var i = 0; i < self.trace.length; i++) {
        if (!self.trace[i].fail) n++;
    }
    return n;
};

IsolateSearchSpec.prototype.countFail = function countFail() {
    var self = this;
    var n = 0;
    for (var i = 0; i < self.trace.length; i++) {
        if (self.trace[i].fail) n++;
    }
    return n;
};

module.exports = TestIsolateSearch;
