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

var parallel = require('run-parallel');

var allocCluster = require('./lib/alloc-cluster.js');

allocCluster.test('request().send() to a pool of servers', {
    numPeers: 5
}, function t(cluster, assert) {
    var client = cluster.channels[0];

    var hosts = cluster.channels.slice(1).map(function hp(c) {
        return c.hostPort;
    });

    var clientChannel = client.makeSubChannel({
        serviceName: 'server',
        peers: hosts
    });

    cluster.channels.slice(1).forEach(function each(chan, i) {
        makeServer(chan, i);
    });

    var callReqThunks = [];
    for (var i = 0; i < 200; i++) {
        var req = clientChannel.request({
            serviceName: 'server',
            hasNoParent: true,
            timeout: 500,
            headers: {
                cn: 'client',
                as: 'raw'
            }
        });

        callReqThunks.push(req.send.bind(req, 'foo', 'a', 'b'));
    }

    parallel(callReqThunks, onResults);

    function onResults(err, results) {
        assert.ifError(err, 'expect no req error');

        var byServer = {};
        for (var j = 0; j < results.length; j++) {
            var res = results[j];
            var body = String(res.arg3);

            if (!byServer[body]) {
                byServer[body] = 0;
            }

            byServer[body]++;
        }

        var keys = Object.keys(byServer);
        assert.equal(keys.length, 4, 'expected 4 servers');

        for (var k = 0; k < keys.length; k++) {
            var count = byServer[keys[k]];

            assert.equal(count, 50, 'count for ' + keys[k] + ' is ' + count);
        }
        assert.end();
    }
});

allocCluster.test('request().send() to a pool of servers', {
    numPeers: 26
}, function t(cluster, assert) {
    var client = cluster.channels[0];

    var numPeers = 25;
    var numRequests = 800;
    var numExpectedReqs = numRequests / numPeers;

    var hosts = cluster.channels.slice(1).map(function hp(c) {
        return c.hostPort;
    });

    var clientChannel = client.makeSubChannel({
        serviceName: 'server',
        peers: hosts
    });

    cluster.channels.slice(1).forEach(function each(chan, i) {
        makeServer(chan, i);
    });

    var waiting = [];
    for (var l = 0; l < numPeers; l++) {
        var host = hosts[l];

        waiting.push(clientChannel.waitForIdentified.bind(clientChannel, {
            host: host
        }));
    }

    parallel(waiting, onWarmedup);

    function onWarmedup(err1) {
        assert.ifError(err1, 'expect no initialize error');

        var callReqThunks = [];
        for (var i = 0; i < numRequests; i++) {
            var req = clientChannel.request({
                serviceName: 'server',
                hasNoParent: true,
                timeout: 500,
                headers: {
                    cn: 'client',
                    as: 'raw'
                }
            });

            callReqThunks.push(req.send.bind(req, 'foo', 'a', 'b'));
        }

        var resultList = [];
        (function loop() {
            if (callReqThunks.length === 0) {
                return onResults(null, resultList);
            }

            var parts = callReqThunks.slice(0, 10);
            callReqThunks = callReqThunks.slice(10);

            parallel(parts, onPartial);

            function onPartial(err2, results) {
                assert.ifError(err2, 'expect no req err');

                resultList = resultList.concat(results);
                loop();
            }
        }());

    }

    function onResults(err, results) {
        assert.ifError(err, 'expect no req err');

        var byServer = {};
        for (var j = 0; j < results.length; j++) {
            var res = results[j];
            var body = String(res.arg3);

            if (!byServer[body]) {
                byServer[body] = 0;
            }

            byServer[body]++;
        }

        var keys = Object.keys(byServer);
        assert.equal(keys.length, numPeers, 'expected 25 servers');

        for (var k = 0; k < keys.length; k++) {
            var count = byServer[keys[k]];

            assert.ok(count >= numExpectedReqs * 0.5,
                'count (' + count + ') for ' + keys[k] +
                    ' is >= ' + numExpectedReqs * 0.5);
            assert.ok(count <= numExpectedReqs * 1.5,
                'count (' + count + ') for ' + keys[k] +
                    ' is <= ' + numExpectedReqs * 1.5);
        }
        assert.end();
    }
});

function makeServer(channel, index) {
    var chanNum = index + 1;

    var serverChan = channel.makeSubChannel({
        serviceName: 'server'
    });

    serverChan.register('foo', function foo(req, res, arg2, arg3) {
        res.headers.as = 'raw';
        res.sendOk(arg2, arg3 + ' served by ' + chanNum);
    });
}
