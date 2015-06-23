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

var os = require('os');

var allocCluster = require('./lib/alloc-cluster.js');

allocCluster.test('emits stats', {
    numPeers: 2
}, function t(cluster, assert) {
    var server = cluster.channels[0];
    var client = cluster.channels[1];
    var serverHost = cluster.hosts[0];
    var clientHost = cluster.hosts[1];
    var stats = [];

    server.makeSubChannel({
        serviceName: 'server'
    }).register('echo', function echo(req, res, h, b) {
        res.headers.as = 'raw';
        res.sendOk(h, b);
    });

    client.statTags = client.options.statTags = {
        app: 'client',
        host: os.hostname()
    };
    var clientChan = client.makeSubChannel({
        serviceName: 'server',
        peers: [server.hostPort],
        requestDefaults: {
            headers: {
                as: 'raw',
                cn: 'wat'
            }
        }
    });

    client.on('stat', function onStat(stat) {
        stats.push(stat);
    });

    clientChan.request({
        serviceName: 'server',
        hasNoParent: true,
        headers: {
            cn: 'client',
            as: 'raw'
        }
    }).send('echo', 'a', 'b', onResponse);

    function onResponse(err, res, arg2, arg3) {
        assert.ifError(err);
        assert.ok(res.ok);
        assert.deepEqual(stats, [{
            name: 'outbound.calls.sent',
            type: 'counter',
            value: 1,
            tags: {
                'target-service': 'server',
                service: 'client',
                'target-endpoint': 'echo',
                app: 'client',
                host: os.hostname()
            }
        }, {
            name: 'connections.initiated',
            type: 'counter',
            value: 1,
            tags: {
                'host-port': clientHost,
                'peer-host-port': serverHost,
                app: 'client',
                host: os.hostname()
            }
        }, {
            name: 'outbound.request.size',
            type: 'counter',
            value: 93,
            tags: {
                'target-service': 'server',
                service: 'client',
                'target-endpoint': 'echo',
                app: 'client',
                host: os.hostname()
            }
        }, {
            name: 'connections.bytes-sent',
            type: 'counter',
            value: 93,
            tags: {
                'host-port': clientHost,
                'peer-host-port': serverHost,
                app: 'client',
                host: os.hostname()
            }
        }, {
            name: 'inbound.response.size',
            type: 'counter',
            value: 64,
            tags: {
                'calling-service': 'client',
                service: 'server',
                endpoint: 'echo',
                app: 'client',
                host: os.hostname()
            }
        }, {
            name: 'connections.bytes-recvd',
            type: 'counter',
            value: 64,
            tags: {
                'host-port': clientHost,
                'peer-host-port': serverHost,
                app: 'client',
                host: os.hostname()
            }
        }, {
            name: 'outbound.calls.per-attempt-latency',
            type: 'timing',
            value: stats[6].value,
            tags: {
                'target-service': 'server',
                service: 'client',
                'target-endpoint': 'echo',
                peer: server.hostPort,
                'retry-count': 0,
                app: 'client',
                host: os.hostname()
            }
        }, {
            name: 'outbound.calls.success',
            type: 'counter',
            value: 1,
            tags: {
                'target-service': 'server',
                service: 'client',
                'target-endpoint': 'echo',
                app: 'client',
                host: os.hostname()
            }
        }, {
            name: 'outbound.calls.latency',
            type: 'timing',
            value: stats[8].value,
            tags: {
                'target-service': 'server',
                service: 'client',
                'target-endpoint': 'echo',
                app: 'client',
                host: os.hostname()
            }
        }]);

        assert.end();
    }
});
