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
var CountedReadySignal = require('ready-signal/counted');
var test = require('tape');
var util = require('util');
var TChannel = require('../../index.js');
var parallel = require('run-parallel');
var debugLogtron = require('debug-logtron');

module.exports = allocCluster;

function allocCluster(n, opts) {
    opts = opts || {};

    var host = 'localhost';
    var logger = debugLogtron('tchannel');
    var cluster = {
        logger: logger,
        hosts: new Array(n),
        channels: new Array(n),
        destroy: destroy,
        ready: CountedReadySignal(n)
    };

    for (var i=0; i<n; i++) {
        createChannel(i);
    }

    return cluster;

    function createChannel(i) {
        var chan = TChannel(extend({
            logger: logger
        }, opts));
        var port = opts.listen && opts.listen[i] || 0;
        chan.listen(port, host);
        cluster.channels[i] = chan;
        chan.once('listening', chanReady);

        function chanReady() {
            var port = chan.address().port;
            cluster.hosts[i] = util.format('%s:%s', host, port);
            cluster.ready.signal(cluster);
        }
    }

    function destroy(cb) {
        parallel(cluster.channels.map(function(chan) {
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

