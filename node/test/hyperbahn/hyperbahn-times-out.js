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
    HyperbahnCluster.test('advertise with timed out hyperbahn', {
        size: 2
    }, function t(cluster, assert) {
        var bob = cluster.dummies[0];
        var steve = cluster.dummies[1];

        MockBahn(steve);

        var client = HyperbahnClient({
            serviceName: 'A',
            callerName: 'A-client',
            hostPortList: [steve.hostPort],
            tchannel: bob,
            hardFail: true,
            advertisementTimeout: 100,
            logger: DebugLogtron('hyperbahnClient')
        });

        client.logger.whitelist('error',
            'HyperbahnClient: advertisement failure, marking server as sick'
        );
        client.logger.whitelist('fatal',
            'HyperbahnClient: advertisement timed out'
        );

        client.advertise({
            timeout: 200
        });
        client.once('error', onError);

        function onError(err) {
            assert.ok(err);

            assert.equal(err.type,
                'hyperbahn-client.advertisement-timeout');
            assert.equal(err.time, 100);
            assert.equal(err.fullType,
                'hyperbahn-client.advertisement-timeout' +
                '~!~error.wrapped-unknown');
            assert.equal(err.causeMessage,
                'advertisement timeout!');

            assert.end();
        }
    });

    HyperbahnCluster.test('advertise with timed out hyperbahn + no hardFail', {
        size: 2
    }, function t(cluster, assert) {
        var bob = cluster.dummies[0];
        var steve = cluster.dummies[0];

        MockBahn(steve);

        var client = HyperbahnClient({
            serviceName: 'A',
            callerName: 'A-client',
            hostPortList: [steve.hostPort],
            tchannel: bob,
            logger: DebugLogtron('hyperbahnClient')
        });

        var attempts = 0;

        client.on('error', onError);
        client.on('advertise-attempt', onAdvertisementAttempt);
        client.advertise({
            timeout: 200
        });

        function onError() {
            assert.ok(false, 'should not error');
        }

        function onAdvertisementAttempt() {
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

function MockBahn(channel) {
    var hyperChan = channel.makeSubChannel({
        serviceName: 'hyperbahn'
    });

    hyperChan.register('ad', ad);

    function ad(req, res, arg2, arg3) {
        /* do nothing to time out */
    }
}
