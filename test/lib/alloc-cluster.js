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
var ReadySignal = require('ready-signal');
var after = require('after');
var test = require('tape');
var util = require('util');
var TChannel = require('../../index.js');
var parallel = require('run-parallel');
var debugLogtron = require('debug-logtron');

module.exports = allocCluster;

function allocCluster(n, opts) {
    opts = opts || {};

    var ready = ReadySignal();
    var listening = after(n, ready.signal);

    var host = 'localhost';
    var logger = debugLogtron('tchannel');
    var ret = {
        logger: logger,
        hosts: new Array(n),
        channels: new Array(n),
        destroy: destroy,
        ready: ready
    };

    for (var i=0; i<n; i++) {
        createChannel(i);
    }

    return ret;

    function createChannel(i) {
        var chan = TChannel(extend({
            logger: logger
        }, opts));
        chan.listen(0, host);
        ret.channels[i] = chan;
        chan.once('listening', chanReady);

        function chanReady() {
            var port = chan.address().port;
            ret.hosts[i] = util.format('%s:%s', host, port);
            listening();
        }
    }

    function destroy(cb) {
        parallel(ret.channels.map(function(chan) {
            return function(done) {
                chan.quit(done);
            };
        }), cb);
    }
}

allocCluster.test = function testCluster(desc, n, opts, t) {
    if (typeof opts === 'function') {
        t = opts;
        opts = {};
    }
    var cluster = allocCluster(n, opts);
    cluster.ready(function clusterReady() {
        test(desc, function t2(assert) {
            assert.once('end', function testEnded() {
                cluster.destroy();
            });
            t(cluster, assert);
        });
    });
};

