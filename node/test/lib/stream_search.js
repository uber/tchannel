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

var EndpointHandler = require('../../endpoint-handler');
var TestIsolateSearch = require('./test_isolate_search');
var allocCluster = require('./alloc-cluster.js');
var base2 = require('./base2');

function TestStreamSearch(options) {
    if (!(this instanceof TestStreamSearch)) {
        return new TestStreamSearch(options);
    }
    var self = this;
    TestIsolateSearch.call(self, options);
    if (typeof options.test === 'function') self.test = options.test;
    self.clusterPool = new allocCluster.Pool(function setupCluster(callback) {
        self.setupCluster(callback);
    });
    if (!self.options.reuseClusterPool) {
        self.on('done', function onSearchTestDone() {
            self.clusterPool.destroy();
        });
    }
}

util.inherits(TestStreamSearch, TestIsolateSearch);

TestStreamSearch.prototype.setupCluster = function setupCluster(callback) {
    var cluster = allocCluster({
        numPeers: 2
    });
    var one = cluster.channels[0];
    one.handler = echoHandler();
    cluster.client = cluster.channels[1].makeSubChannel({
        serviceName: 'test_client'
    });
    cluster.ready(clusterReady);
    function clusterReady() {
        cluster.client.peers.add(cluster.hosts[0]);
        callback(null, cluster);
    }
};

TestStreamSearch.prototype.willFailLike = function willFailLike(a, b) {
    if (like(a, b)) return true;
    for (var i = 0; i < b.trace.length; i++) {
        var res = b.trace[i];
        if (res.fail && like(a, res.state)) return true;
    }
    return false;
    function like(a, b) {
        if (a.test.hSize !== b.test.hSize) return false;
        if (a.test.bSize < b.test.bSize) return false;
        return true;
    }
};

TestStreamSearch.prototype.describeState = function describeState(state) {
    return util.format('head %s body %s',
        base2.pretty(state.test.hSize, 'B'),
        base2.pretty(state.test.bSize, 'B'));
};

TestStreamSearch.prototype.describeNoFailure = function describeNoFailure(assert) {
    var self = this;
    var limit = base2.pretty(self.options.sizeLimit, 'B');
    assert.pass('found no failure under ' + limit);
};

TestStreamSearch.prototype.init = function init() {
    var self = this;
    self.expand(function(_emit) {
        var base = {hSize: 0, bSize: 0, timeout: self.options.timeout};
        self.options.basis.forEach(function each(n) {
            if (self.options.withHeaderOnly) emit({hSize: n});
            if (self.options.withBodyOnly) emit({bSize: n});
            if (self.options.withBoth) emit({hSize: n, bSize: n});
        });
        function emit(overlay) {
            _emit(self.makeSpec(extend(base, overlay)));
        }
    });
};

TestStreamSearch.prototype.test = function test(state, assert) {
    throw new Error('not implemented');
};

TestStreamSearch.prototype.explore = function explore(spec, _emit) {
    var self = this;
    var good = spec.good.test;
    (self.options.mul || self.options.basis).forEach(function each(n) {
        if (n < 2) return;
        var hSize = n * good.hSize;
        var bSize = n * good.bSize;
        if (hSize <= self.options.sizeLimit) emit({hSize: hSize});
        if (bSize <= self.options.sizeLimit) emit({bSize: bSize});
    });
    function emit(overlay) {
        _emit(spec.makeTest(extend(good, overlay)));
    }
};

TestStreamSearch.prototype.isolate = function isolate(spec, _emit) {
    var good = spec.good && spec.good.test || {hSize: 0, bSize: 0};
    var bad = spec.bad.test;
    if (bad.hSize - good.hSize > 1) emit({hSize: mid(good.hSize, bad.hSize)});
    if (good.bSize < bad.bSize) emit({bSize: mid(good.bSize, bad.bSize)});
    function emit(overlay) {
        _emit(spec.makeTest(extend(good, overlay)));
    }
    function mid(a, b) {
        return a + Math.floor(b / 2 - a / 2);
    }
};

function echoHandler() {
    var handler = EndpointHandler();
    function foo(req, buildRes) {
        var res = buildRes({streamed: req.streamed});
        if (req.streamed) {
            res.setOk(true);
            req.arg2.on('data', function onArg2Data(chunk) {
                res.arg2.write(chunk);
            });
            req.arg2.on('end', function onArg2End() {
                res.arg2.end();
            });
            req.arg3.on('data', function onArg3Data(chunk) {
                res.arg3.write(chunk);
            });
            req.arg3.on('end', function onArg3End() {
                res.arg3.end();
            });
        } else {
            res.sendOk(req.arg2, req.arg3);
        }
    }
    foo.canStream = true;
    handler.register('foo', foo);
    return handler;
}

module.exports = TestStreamSearch;
