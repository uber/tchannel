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
    HyperbahnCluster.test('register with timed out hyperbahn', {
        size: 2
    }, function t(cluster, assert) {
        var bob = cluster.remotes.bob;
        var steve = cluster.remotes.steve;

        MockBahn(steve.channel);

        var client = HyperbahnClient({
            serviceName: 'A',
            callerName: 'A-client',
            hostPortList: [steve.channel.hostPort],
            tchannel: bob.channel,
            hardFail: true,
            registrationTimeout: 100,
            logger: DebugLogtron('hyperbahnClient')
        });

        client.logger.whitelist('error',
            'HyperbahnClient: registration failure, marking server as sick'
        );
        client.logger.whitelist('fatal',
            'HyperbahnClient: registration timed out'
        );

        client.register({
            timeout: 200
        });
        client.once('error', onError);

        function onError(err) {
            assert.ok(err);

            assert.equal(err.type,
                'hyperbahn-client.registration-timeout');
            assert.equal(err.time, 100);
            assert.equal(err.fullType,
                'hyperbahn-client.registration-timeout' +
                '~!~error.wrapped-unknown');
            assert.equal(err.causeMessage,
                'registration timeout!');

            assert.end();
        }
    });

    HyperbahnCluster.test('register with timed out hyperbahn + no hardFail', {
        size: 2
    }, function t(cluster, assert) {
        var bob = cluster.remotes.bob;
        var steve = cluster.remotes.steve;

        MockBahn(steve.channel);

        var client = HyperbahnClient({
            serviceName: 'A',
            callerName: 'A-client',
            hostPortList: [steve.channel.hostPort],
            tchannel: bob.channel,
            logger: DebugLogtron('hyperbahnClient')
        });

        var attempts = 0;

        client.on('error', onError);
        client.on('register-attempt', onRegisterAttempt);
        client.register({
            timeout: 200
        });

        function onError() {
            assert.ok(false, 'should not error');
        }

        function onRegisterAttempt() {
            if (++attempts < 3) {
                return;
            }

            client.removeListener('register-attempt', onRegisterAttempt);

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
