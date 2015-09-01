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

var DebugLogtron = require('debug-logtron');

var HyperbahnClient = require('../../hyperbahn/index.js');

module.exports = runTests;

if (require.main === module) {
    runTests(require('../lib/hyperbahn-cluster.js'));
}

function runTests(HyperbahnCluster) {
    HyperbahnCluster.test('advertise with hyperbahn down', {
        size: 2
    }, function t(cluster, assert) {
        var bob = cluster.dummies[0];

        var client = HyperbahnClient({
            serviceName: 'A',
            callerName: 'A-client',
            // 5001 & 5002 should be DEAD ports
            hostPortList: ['127.0.0.1:5001', '127.0.0.1:5002'],
            tchannel: bob,
            hardFail: true,
            advertisementTimeout: 200,
            logger: DebugLogtron('hyperbahnClient')
        });

        client.logger.whitelist('error',
            'HyperbahnClient: advertisement failure, marking server as sick'
        );
        client.logger.whitelist('fatal',
            'HyperbahnClient: advertisement timed out'
        );

        client.advertise();
        client.once('error', onError);

        function onError(err) {
            assert.ok(err);

            assert.equal(err.type,
                'hyperbahn-client.advertisement-timeout');
            assert.equal(err.time, 200);
            assert.equal(err.code, 'ECONNREFUSED');
            assert.equal(err.syscall, 'connect');
            assert.ok(err.fullType.indexOf(
                'hyperbahn-client.advertisement-timeout' +
                '~!~tchannel.socket', 0) === 0,
                'error should be advertisement timeout, wrapping etc');
            assert.equal(err.causeMessage,
                'tchannel socket error ' +
                '(ECONNREFUSED from connect): ' +
                'connect ECONNREFUSED');

            assert.end();
        }
    });

    HyperbahnCluster.test('advertise with hyperbahn down + no hardFail', {
        size: 5
    }, function t(cluster, assert) {
        var bob = cluster.dummies[0];

        var client = HyperbahnClient({
            serviceName: 'A',
            callerName: 'A-client',
            // 5001 & 5002 should be DEAD ports
            hostPortList: ['127.0.0.1:5001', '127.0.0.1:5002'],
            tchannel: bob,
            logger: DebugLogtron('hyperbahnClient')
        });

        var attempts = 0;
        var start = Date.now();

        var gap = {
            0: [0, 25],
            1: [200, 250],
            2: [1200, 1300]
        };

        client.on('error', onError);
        client.on('advertise-attempt', onAdvertisementAttempt);
        client.advertise();

        function onError() {
            assert.ok(false, 'should not error');
        }

        function onAdvertisementAttempt() {
            var delta = Date.now() - start;
            assert.ok(gap[attempts][0] <= delta);
            assert.ok(delta <= gap[attempts][1]);

            if (++attempts < 3) {
                return;
            }

            client.removeListener(
                'advertise-attempt', onAdvertisementAttempt
            );

            client.destroy();
            assert.ok(true);

            assert.end();
        }
    });
}
