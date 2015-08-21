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

var NullLogtron = require('null-logtron');
var NullStatsd = require('uber-statsd-client/null');

var allocCluster = require('./lib/test-cluster.js');

allocCluster.test('server writes to access', {
    clients: {
        logger: NullLogtron(),
        statsd: NullStatsd()
    }
}, function t(cluster, assert) {
    var app = cluster.apps[0];
    var statsd = app.clients.statsd;

    app.client.sendHealth(function onResponse(err, resp) {
        app.clients.tchannel.flushStats();

        assert.ifError(err);
        if (!err) {
            assert.equal(resp.body, 'hello from autobahn\n');
            var stats = statsd._buffer._elements.slice();
            var accessStats = stats.filter(function is(x) {
                return x.type === 'c' &&
                    x.name === 'tchannel.inbound.calls.recvd.' +
                        'test-client.autobahn.health_v1';
            });
            assert.equal(accessStats.length, 1);
            var stat = accessStats[0] || {};
            assert.equal(stat.delta, 1);
            assert.equal(stat.name,
                'tchannel.inbound.calls.recvd.' +
                 'test-client.autobahn.health_v1');
        }
        assert.end();
    });
});
