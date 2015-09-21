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

var setTimeout = require('timers').setTimeout;

var allocCluster = require('../lib/test-cluster.js');
var parallel = require('run-parallel');

allocCluster.test('request circuit state from endpoint', {
    size: 2,
    kValue: 1,
    remoteConfig: {
        'rateLimiting.enabled': false,
        'circuits.enabled': true
    },
    seedConfig: {
        'hyperbahn.circuits': {
            period: 10,
            maxErrorRate: 0.5,
            minRequests: 0,
            probation: 5,
            enabled: true
        }
    }
}, function t(cluster, assert) {
    cluster.logger.whitelist('warn', 'forwarding error frame');

    cluster.remotes.bob.serverChannel.register('ifyousayso',
        function respond(req, res, head, body) {
            head = head.toString();
            body = body.toString();
            res.headers.as = 'raw';

            if (head === 'no') {
                res.sendError(body, 'error');
            } else if (head === 'yes') {
                res.sendOk(body);
            } else {
                assert(false, 'request should be yes or no');
            }
        });

    var count = 100;

    sendRequest(cluster, true, afterPreparation);

    function afterPreparation(err) {
        if (err) {
            return assert.end(err);
        }

        sendRequests();
    }

    function sendRequests() {
        var tasks = [];
        for (var i = 0; i < count; i++) {
            // 0.5 is the error rate threshold. There is some variance.
            // Test seems to pass with a success rate of 0.4, flipping the
            // circuit breaker.
            tasks.push(sendRequest.bind(null, cluster, Math.random() < 0.2));
        }

        parallel(tasks, afterBarrage);
    }

    function afterBarrage(err) {
        if (err) {
            return assert.end(err);
        }

        setTimeout(whenTheSmokeClears, 500);
    }

    function whenTheSmokeClears() {
        sendRequest(cluster, false, requestCircuitsState);
    }

    function requestCircuitsState() {
        var exitNodes = cluster.getExitNodes('bob');
        assert.equal(exitNodes.length, 1);
        var hostPort = exitNodes[0].hostPort;

        // Using bob, because steve's peer is unhealthy.
        var channel = cluster.remotes.bob.clientChannel;
        channel.waitForIdentified({
            host: hostPort
        }, function onConnect(err) {
            assert.ifError(err);

            var request = channel.request({
                serviceName: 'autobahn',
                timeout: 1000,
                host: hostPort,
                hasNoParent: true,
                headers: {
                    as: 'json'
                }
            });
            cluster.tchannelJSON.send(request, 'circuits_v1', null, null, onCircuitsResponse);
        });
    }

    function onCircuitsResponse(err, res) {
        if (err) {
            return assert.end(err);
        }

        assert.equals(res.ok, true);
        var circuits = res.body;
        assert.equals(circuits.length, 1);
        var circuit = circuits[0];
        assert.equals(circuit.cn, 'steve', 'caller name');
        assert.equals(circuit.sn, 'bob', 'service name');
        assert.equals(circuit.en, 'ifyousayso', 'endpoint name');
        assert.equals(circuit.locked, false, 'not locked');
        assert.equals(circuit.healthy, false, 'unhealthy');

        assert.end();
    }
});

function sendRequest(cluster, yes, callback) {
    var request = cluster.remotes.steve.clientChannel.request({
        serviceName: 'bob',
        timeout: 1000,
        hasNoParent: true
    });

    if (yes) {
        request.send('ifyousayso', 'yes', 'Said so', callback);
    } else {
        request.send('ifyousayso', 'no', 'UnexpectedError', onErr);
    }

    // Ignore the error responses; they are expected.
    function onErr() {
        callback();
    }
}
