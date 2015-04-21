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

allocCluster.test('request retries', {
    numPeers: 2
}, function t(cluster, assert) {
    var one = cluster.channels[0];
    var two = cluster.channels[1];

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
        logger: one.logger
    });
    var twoClient = client.makeSubChannel({
        serviceName: 'two',
        peers: [one.hostPort]
    });

    twoClient.request().send('echo', 'foo', 'bar', function done(err, res, arg2, arg3) {
        assert.ifError(err, 'no unexpected error');
        assert.equal(String(arg2), 'foo', 'expected arg2');
        assert.equal(String(arg3), 'bar', 'expected arg3');
        assert.end();
    });
});

allocCluster.test('relay an error frame', {
    numPeers: 4
}, function t(cluster, assert) {
    var one = cluster.channels[0];
    var two = cluster.channels[1];
    var three = cluster.channels[2];
    var four = cluster.channels[3];

    var oneToTwo = one.makeSubChannel({
        serviceName: 'two',
        peers: [two.hostPort, three.hostPort]
    });
    oneToTwo.handler = new RelayHandler(oneToTwo);
    var fourToTwo = four.makeSubChannel({
        serviceName: 'two',
        peers: [two.hostPort, three.hostPort]
    });
    fourToTwo.handler = new RelayHandler(fourToTwo);

    var twoSvc2 = three.makeSubChannel({
        serviceName: 'two'
    });
    twoSvc2.register('decline', declineError);

    var twoSvc = two.makeSubChannel({
        serviceName: 'two'
    });
    twoSvc.register('decline', declineError);

    var client = TChannel({
        logger: one.logger
    });
    var twoClient = client.makeSubChannel({
        serviceName: 'two',
        peers: [one.hostPort, four.hostPort]
    });

    twoClient.request().send('decline', 'foo', 'bar', function done(err, res, arg2, arg3) {
        assert.equal(err.type, 'tchannel.declined', 'expected declined error');

        assert.end();
    });

    function declineError(req, res, arg2, arg3) {
        res.sendError('Declined', 'lul');
    }
});

function echo(req, res, arg2, arg3) {
    res.sendOk(arg2, arg3);
}
