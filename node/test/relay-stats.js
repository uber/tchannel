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

var allocCluster = require('./lib/alloc-cluster');
var TChannel = require('../channel');
var RelayHandler = require('../relay_handler');

var statsFixture = require('./fixtures/relay-stats');

allocCluster.test('relay emits latency stat', {
    numPeers: 2
}, function t(cluster, assert) {
    var one = cluster.channels[0];
    var two = cluster.channels[1];
    var stats = [];

    one.on('stat', function onStat(stat) {
        stats.push(stat);
    });

    var oneToTwo = one.makeSubChannel({
        serviceName: 'two',
        peers: [two.hostPort]
    });
    oneToTwo.handler = new RelayHandler(oneToTwo);

    var twoSvc = two.makeSubChannel({
        serviceName: 'two'
    });
    twoSvc.register('echo', echo);

    var client = TChannel({
        logger: one.logger,
        timeoutFuzz: 0
    });
    var twoClient = client.makeSubChannel({
        serviceName: 'two',
        peers: [one.hostPort],
        requestDefaults: {
            serviceName: 'two',
            headers: {
                as: 'raw',
                cn: 'wat'
            }
        }
    });

    twoClient.request({
        hasNoParent: true
    }).send('echo', 'foo', 'bar', function done(err, res, arg2, arg3) {
        assert.ifError(err, 'no unexpected error');
        assert.equal(String(arg2), 'foo', 'expected arg2');
        assert.equal(String(arg3), 'bar', 'expected arg3');

        client.close();

        process.nextTick(checkStat);

        function checkStat() {
            statsFixture.verify(assert, stats, statsFixture.fixture);
        }

        assert.end();
    });
});

function echo(req, res, arg2, arg3) {
    res.headers.as = 'raw';
    res.sendOk(arg2, arg3);
}

function findStat(stats, name, type) {
    var i;
    for (i = 0; i < stats.length; i++) {
        if (stats[i].name === name && stats[i].type === type) {
            return true;
        }
    }

    return false;
}
