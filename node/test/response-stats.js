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

allocCluster.test('emits response stats with ok', {
    numPeers: 2,
    channelOptions: {
        statTags: {
            app: 'server',
            host: os.hostname()
        },
        emitConnectionMetrics: true
    }
}, function t(cluster, assert) {
    var server = cluster.channels[0];
    var client = cluster.channels[1];
    var serverHost = cluster.hosts[0];
    var clientHost;
    var stats = [];
    server.on('connection', function onConnection(conn) {
        clientHost = conn.socketRemoteAddr;
    });

    server.makeSubChannel({
        serviceName: 'server'
    }).register('echo', function echo(req, res, h, b) {
        res.headers.as = 'raw';
        res.sendOk(h, b);
    });
    server.on('stat', function onStat(stat) {
        stats.push(stat);
    });

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

    clientChan.request({
        serviceName: 'server',
        hasNoParent: true,
        headers: {
            cn: 'client'
        }
    }).send('echo', 'c', 'd', onResponse);

    function onResponse(err, res, arg2, arg3) {
        if (err) {
            return assert.end(err);
        }

        server.flushStats();

        assert.ok(res.ok, 'res should be ok');
        assert.deepEqual(stats, [{
            name: 'tchannel.connections.accepted',
            type: 'counter',
            value: 1,
            tags:
            {
                'host-port': serverHost,
                'peer-host-port': clientHost,
                app: 'server',
                host: os.hostname(),
                cluster: '',
                version: ''
           }
        }, {
            name: 'tchannel.inbound.request.size',
            type: 'counter',
            value: 93,
            tags: {
                callingService: 'client',
                service: 'server',
                endpoint: 'echo',
                app: 'server',
                host: os.hostname(),
                cluster: '',
                version: ''
            }
        }, {
            name: 'tchannel.connections.bytes-recvd',
            type: 'counter',
            value: 93,
            tags: {
                hostPort: serverHost,
                peerHostPort: clientHost,
                app: 'server',
                host: os.hostname(),
                cluster: '',
                version: ''
            }
        }, {
            name: 'tchannel.inbound.calls.recvd',
            type: 'counter',
            value: 1,
            tags: {
                callingService: 'client',
                service: 'server',
                endpoint: 'echo',
                app: 'server',
                host: os.hostname(),
                cluster: '',
                version: ''
            }
        }, {
            name: 'tchannel.inbound.calls.success',
            type: 'counter',
            value: 1,
            tags: {
                callingService: 'client',
                service: 'server',
                endpoint: 'echo',
                app: 'server',
                host: os.hostname(),
                cluster: '',
                version: ''
            }
        }, {
            name: 'tchannel.outbound.response.size',
            type: 'counter',
            value: 64,
            tags: { 
                targetService: 'server',
                service: 'client',
                targetEndpoint: 'echo',
                app: 'server',
                host: os.hostname(),
                cluster: '',
                version: ''
            }
        }, {
            name: 'tchannel.connections.bytes-sent',
            type: 'counter',
            value: 64,
            tags: {
                hostPort: serverHost,
                peerHostPort: clientHost,
                app: 'server',
                host: os.hostname(),
                cluster: '',
                version: ''
            }
        }, {
            name: 'tchannel.inbound.calls.latency',
            type: 'timing',
            value: stats[7].value,
            tags: {
                callingService: 'client',
                service: 'server',
                endpoint: 'echo',
                app: 'server',
                host: os.hostname(),
                cluster: '',
                version: ''
            }
        }]);

        assert.end();
    }
});

allocCluster.test('emits response stats with not ok', {
    numPeers: 2,
    channelOptions: {
        statTags: {
            app: 'server',
            host: os.hostname()
        },
        emitConnectionMetrics: true
    }
}, function t(cluster, assert) {
    var server = cluster.channels[0];
    var client = cluster.channels[1];
    var serverHost = cluster.hosts[0];
    var clientHost;
    var stats = [];
    server.on('connection', function onConnection(conn) {
        clientHost = conn.socketRemoteAddr;
    });

    server.makeSubChannel({
        serviceName: 'server'
    }).register('echo', function echo(req, res, h, b) {
        res.headers.as = 'raw';
        res.sendNotOk('failure', 'busy');
    });
    server.on('stat', function onStat(stat) {
        stats.push(stat);
    });

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

    clientChan.request({
        serviceName: 'server',
        hasNoParent: true,
        headers: {
            cn: 'client'
        }
    }).send('echo', 'c', 'd', onResponse);

    function onResponse(err, res, arg2, arg3) {
        if (err) {
            return assert.end(err);
        }

        server.flushStats();

        assert.equal(res.ok, false, 'res should be not ok');
        assert.deepEqual(stats, [{
            name: 'tchannel.connections.accepted',
            type: 'counter',
            value: 1,
            tags:
            {
                'host-port': serverHost,
                'peer-host-port': clientHost,
                app: 'server',
                host: os.hostname(),
                cluster: '',
                version: ''
           }
        }, {
            name: 'tchannel.inbound.request.size',
            type: 'counter',
            value: 93,
            tags: {
                callingService: 'client',
                service: 'server',
                endpoint: 'echo',
                app: 'server',
                host: os.hostname(),
                cluster: '',
                version: ''
            }
        }, {
            name: 'tchannel.connections.bytes-recvd',
            type: 'counter',
            value: 93,
            tags: {
                hostPort: serverHost,
                peerHostPort: clientHost,
                app: 'server',
                host: os.hostname(),
                cluster: '',
                version: ''
            }
        }, {
            name: 'tchannel.inbound.calls.recvd',
            type: 'counter',
            value: 1,
            tags: {
                callingService: 'client',
                service: 'server',
                endpoint: 'echo',
                app: 'server',
                host: os.hostname(),
                cluster: '',
                version: ''
            }
        }, {
            name: 'tchannel.inbound.calls.app-errors',
            type: 'counter',
            value: 1,
            tags: {
                callingService: 'client',
                service: 'server',
                endpoint: 'echo',
                type: 'unknown',
                app: 'server',
                host: os.hostname(),
                cluster: '',
                version: ''
            }
        }, {
            name: 'tchannel.outbound.response.size',
            type: 'counter',
            value: 73,
            tags: {
                targetService: 'server',
                service: 'client',
                targetEndpoint: 'echo',
                app: 'server',
                host: os.hostname(),
                cluster: '',
                version: ''
            }
        }, {
            name: 'tchannel.connections.bytes-sent',
            type: 'counter',
            value: 73,
            tags: {
                hostPort: serverHost,
                peerHostPort: clientHost,
                app: 'server',
                host: os.hostname(),
                cluster: '',
                version: ''
            }
        }, {
            name: 'tchannel.inbound.calls.latency',
            type: 'timing',
            value: stats[7].value,
            tags: {
                callingService: 'client',
                service: 'server',
                endpoint: 'echo',
                app: 'server',
                host: os.hostname(),
                cluster: '',
                version: ''
            }
        }]);

        assert.end();
    }
});

allocCluster.test('emits response stats with error', {
    numPeers: 2,
    channelOptions: {
        statTags: {
            app: 'server',
            host: os.hostname()
        },
        emitConnectionMetrics: true
    }
}, function t(cluster, assert) {
    var server = cluster.channels[0];
    var client = cluster.channels[1];
    var serverHost = cluster.hosts[0];
    var clientHost;
    var stats = [];
    server.on('connection', function onConnection(conn) {
        clientHost = conn.socketRemoteAddr;
    });

    server.makeSubChannel({
        serviceName: 'server'
    }).register('echo', function echo(req, res, h, b) {
        res.sendError('ProtocolError', 'bad request!');
    });
    server.on('stat', function onStat(stat) {
        stats.push(stat);
    });

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

    clientChan.request({
        serviceName: 'server',
        hasNoParent: true,
        headers: {
            cn: 'client'
        }
    }).send('echo', 'c', 'd', onResponse);

    function onResponse(err, res, arg2, arg3) {
        server.flushStats();
        
        assert.notEqual(err, null, 'err should not be null');
        assert.equal(res, null, 'res should be null');
        assert.deepEqual(stats, [{
            name: 'tchannel.connections.accepted',
            type: 'counter',
            value: 1,
            tags:
            {
                'host-port': serverHost,
                'peer-host-port': clientHost,
                app: 'server',
                host: os.hostname(),
                cluster: '',
                version: ''
           }
        }, {
            name: 'tchannel.inbound.request.size',
            type: 'counter',
            value: 93,
            tags: {
                callingService: 'client',
                service: 'server',
                endpoint: 'echo',
                app: 'server',
                host: os.hostname(),
                cluster: '',
                version: ''
            }
        }, {
            name: 'tchannel.connections.bytes-recvd',
            type: 'counter',
            value: 93,
            tags: {
                hostPort: serverHost,
                peerHostPort: clientHost,
                app: 'server',
                host: os.hostname(),
                cluster: '',
                version: ''
            }
        }, {
            name: 'tchannel.inbound.calls.recvd',
            type: 'counter',
            value: 1,
            tags: {
                callingService: 'client',
                service: 'server',
                endpoint: 'echo',
                app: 'server',
                host: os.hostname(),
                cluster: '',
                version: ''
            }
        }, {
            name: 'tchannel.inbound.calls.system-errors',
            type: 'counter',
            value: 1,
            tags: {
                'calling-service': 'client',
                service: 'server',
                endpoint: 'echo',
                type: 'ProtocolError',
                app: 'server',
                host: os.hostname(),
                cluster: '',
                version: ''
            }
        }, {
            name: 'tchannel.inbound.calls.latency',
            type: 'timing',
            value: stats[5].value,
            tags: {
                callingService: 'client',
                service: 'server',
                endpoint: 'echo',
                app: 'server',
                host: os.hostname(),
                cluster: '',
                version: ''
            }
        }]);

        assert.end();
    }
});
