'use strict';

var setTimeout = require('timers').setTimeout;

var allocCluster = require('../lib/test-cluster.js');
var parallel = require('run-parallel');

allocCluster.test('request circuit state from endpoint', {
    size: 2,
    seedConfig: {
        'rateLimiting': {
            'enabled': false
        },
        'circuits': {
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
            tasks.push(sendRequest.bind(null, cluster, Math.random() < 0.4));
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
        // Using bob, because steve's peer is unhealthy.
        var channel = cluster.remotes.bob.clientChannel;
        var request = channel.request({
            serviceName: 'autobahn',
            timeout: 1000,
            hasNoParent: true,
            headers: {
                as: 'json'
            }
        });
        cluster.tchannelJSON.send(request, 'circuits_v1', null, null, onCircuitsResponse);
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
