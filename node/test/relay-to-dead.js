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

var net = require('net');
var setTimeout = require('timers').setTimeout;

var allocCluster = require('./lib/alloc-cluster');
var RelayHandler = require('../relay_handler');

allocCluster.test('relaying to init timeout server', {
    numPeers: 2
}, function t(cluster, assert) {
    var deadServer = net.createServer();

    deadServer.listen(0, '127.0.0.1', onListen);

    function onListen() {
        var deadPort = deadServer.address().port;
        var deadHostPort = '127.0.0.1:' + deadPort;

        var client = cluster.channels[0];
        var relay = cluster.channels[1];
        relay.initTimeout = 250;

        var relayChan = relay.makeSubChannel({
            serviceName: 'dead-service',
            peers: [deadHostPort]
        });
        relayChan.handler = new RelayHandler(relayChan);

        var clientChan = client.makeSubChannel({
            serviceName: 'dead-service',
            peers: [relay.hostPort],
            requestDefaults: {
                serviceName: 'dead-service',
                headers: {
                    as: 'raw',
                    cn: 'client'
                }
            }
        });

        clientChan.request({
            hasNoParent: true,
            timeout: 50
        }).send('echo', '', '', onResponse);

        function onResponse(err) {
            // should expect in timeout
            assert.ok(err);
            // console.log('err', err);
            assert.ok(err.type === 'tchannel.request.timeout' ||
                err.type === 'tchannel.timeout'
            );

            assert.equal(cluster.logger.items().length, 0);
            cluster.logger.whitelist('warn', 'destroying due to init timeout');
            cluster.logger.whitelist('warn', 'resetting connection');
            cluster.logger.whitelist('warn', 'Got a connection error');

            setTimeout(function onTimeout() {
                var logs = cluster.logger.items();
                assert.equal(logs.length, 3, 'expected 3 logs');

                var record1 = logs[0];
                var record2 = logs[1];
                var record3 = logs[2];

                assert.equal(record1.msg, 'destroying due to init timeout');
                assert.equal(record2.msg, 'resetting connection');
                assert.equal(record3.msg, 'Got a connection error');

                deadServer.close();
                assert.end();
            }, 350);
        }
    }
});
