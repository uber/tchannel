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
var TChannelJSON = require('../../as/json');

module.exports = runTests;

if (require.main === module) {
    runTests(require('../lib/hyperbahn-cluster.js'));
}

function runTests(HyperbahnCluster) {
    HyperbahnCluster.test('advertise and forward', {
        size: 10
    }, function t(cluster, assert) {
        var steve = cluster.remotes.steve;
        var bob = cluster.remotes.bob;

        var steveHyperbahnClient = new HyperbahnClient({
            serviceName: steve.serviceName,
            hostPortList: cluster.hostPortList,
            tchannel: steve.channel,
            callerName: 'forward-retry-test',
            logger: DebugLogtron('hyperbahnClient')
        });

        var tchannelJSON = TChannelJSON({
            logger: steve.logger
        });

        steveHyperbahnClient.once('advertised', onSteveAdvertised);
        steveHyperbahnClient.advertise(onSteveAdvertised);

        // TODO: intermittent flap about can't request on destroyed channel
        // TODO: flappy leaked handle hang

        function onSteveAdvertised() {
            var egressNodes = cluster.apps[0].exitsFor(steve.serviceName);

            cluster.apps.forEach(function destroyBobEgressNodes(node) {
                if (egressNodes[node.hostPort]) {
                    node.destroy({
                        force: true
                    });
                }
            });

            var fwdreq = bob.clientChannel.request({
                timeout: 5000,
                serviceName: 'steve',
                hasNoParent: true,
                retryLimit: 20,
                headers: {
                    cn: 'test'
                }
            });
            tchannelJSON.send(fwdreq, 'echo', null, 'oh hi lol', onForwarded);

            function onForwarded(err2, resp) {
                // TODO: cleaner once we have explicit network error type
                assert.ok(
                    err2 && err2.type === 'tchannel.socket' ||
                    /socket/.test(err2 && err2.message),
                    'expceted to have failed socket');

                fwdreq.outReqs.forEach(function each(outreq) {
                    if (egressNodes[outreq.remoteAddr]) {
                        assert.ok(
                            outreq.err.type === 'tchannel.socket' ||
                            outreq.err.type === 'tchannel.connection.reset',
                            'expected socket error from exit node');
                    } else {
                        // TODO: would be great to have an explicit network error
                        // for that
                        assert.ok(
                            outreq.err.type === 'tchannel.network' ||
                            outreq.err.type === 'tchannel.connection.reset',
                            'expected socket error from forward node');
                    }
                });

                finish();
            }
        }

        function finish() {
            steveHyperbahnClient.destroy();
            assert.end();
        }
    });
}
