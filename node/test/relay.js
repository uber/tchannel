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

var allocCluster = require('./lib/alloc-cluster');
var TChannel = require('../channel');
var RelayHandler = require('../relay_handler');
var RelayNetwork = require('./lib/relay_network');
var CountedReady = require('ready-signal/counted');

allocCluster.test('send relay requests', {
    numPeers: 2
}, function t(cluster, assert) {
    var one = cluster.channels[0];
    var two = cluster.channels[1];

    var oneToTwo = one.makeSubChannel({
        serviceName: 'two',
        peers: [two.hostPort]
    });
    oneToTwo.handler = new RelayHandler(oneToTwo);

    var twoSvc = two.makeSubChannel({
        serviceName: 'two'
    });
    twoSvc.register('echo', echo);

    var client = TChannel({
        logger: one.logger
    });
    var twoClient = client.makeSubChannel({
        serviceName: 'two',
        peers: [one.hostPort],
        requestDefaults: {
            serviceName: 'two',
            headers: {
                as: 'raw',
                cn: 'wat'
            }
        }
    });

    twoClient.request({
        hasNoParent: true
    }).send('echo', 'foo', 'bar', function done(err, res, arg2, arg3) {
        assert.ifError(err, 'no unexpected error');
        assert.equal(String(arg2), 'foo', 'expected arg2');
        assert.equal(String(arg3), 'bar', 'expected arg3');

        client.close();
        assert.end();
    });
});

allocCluster.test('send relay with tiny timeout', {
    numPeers: 2
}, function t(cluster, assert) {
    var one = cluster.channels[0];
    var two = cluster.channels[1];

    var oneToTwo = one.makeSubChannel({
        serviceName: 'two',
        peers: [two.hostPort]
    });
    oneToTwo.handler = new RelayHandler(oneToTwo);

    var twoSvc = two.makeSubChannel({
        serviceName: 'two'
    });
    twoSvc.register('echo', echo);

    var client = TChannel({
        logger: one.logger
    });
    var twoClient = client.makeSubChannel({
        serviceName: 'two',
        peers: [one.hostPort],
        requestDefaults: {
            serviceName: 'two',
            headers: {
                as: 'raw',
                cn: 'wat'
            }
        }
    });

    twoClient.waitForIdentified({
        host: one.hostPort
    }, onIdentified);

    function onIdentified(err1) {
        assert.ifError(err1);

        twoClient.request({
            hasNoParent: true,
            host: one.hostPort,
            timeout: 1
        }).send('echo', 'foo', 'bar', function done(err2, res, arg2, arg3) {
            assert.ifError(err2, 'no unexpected error');
            assert.equal(String(arg2), 'foo', 'expected arg2');
            assert.equal(String(arg3), 'bar', 'expected arg3');

            client.close();
            assert.end();
        });
    }
});

allocCluster.test('relay respects ttl', {
    numPeers: 3
}, function t(cluster, assert) {
    var relay = cluster.channels[0];
    var source = cluster.channels[1];
    var dest = cluster.channels[2];

    var relayChan = relay.makeSubChannel({
        serviceName: 'dest',
        peers: [dest.hostPort]
    });
    relayChan.handler = new RelayHandler(relayChan);

    var destChan = dest.makeSubChannel({
        serviceName: 'dest'
    });
    destChan.register('echoTTL', function echoTTL(req, res) {
        res.headers.as = 'raw';
        res.sendOk(null, String(req.timeout));
    });

    var sourceChan = source.makeSubChannel({
        serviceName: 'dest',
        peers: [relay.hostPort],
        requestDefaults: {
            headers: {
                as: 'raw',
                cn: 'wat'
            }
        }
    });

    sourceChan.request({
        serviceName: 'dest',
        hasNoParent: true,
        timeout: 250
    }).send('echoTTL', null, null, onResponse);

    function onResponse(err, res, arg2, arg3) {
        assert.ifError(err);
        assert.ok(res.ok);

        var ttl = Number(String(arg3));
        assert.ok(ttl >= 240 && ttl <= 250);

        assert.end();
    }
});

allocCluster.test('relay an error frame', {
    numPeers: 4
}, function t(cluster, assert) {
    cluster.logger.whitelist('warn', 'forwarding error frame');

    var one = cluster.channels[0];
    var two = cluster.channels[1];
    var three = cluster.channels[2];
    var four = cluster.channels[3];

    var oneToTwo = one.makeSubChannel({
        serviceName: 'two',
        peers: [two.hostPort, three.hostPort]
    });
    oneToTwo.handler = new RelayHandler(oneToTwo);
    var fourToTwo = four.makeSubChannel({
        serviceName: 'two',
        peers: [two.hostPort, three.hostPort]
    });
    fourToTwo.handler = new RelayHandler(fourToTwo);

    var twoSvc2 = three.makeSubChannel({
        serviceName: 'two'
    });
    twoSvc2.register('decline', declineError);

    var twoSvc = two.makeSubChannel({
        serviceName: 'two'
    });
    twoSvc.register('decline', declineError);

    var client = TChannel({
        logger: one.logger
    });
    var twoClient = client.makeSubChannel({
        serviceName: 'two',
        peers: [one.hostPort, four.hostPort],
        requestDefaults: {
            serviceName: 'two',
            headers: {
                as: 'raw',
                cn: 'wat'
            }
        }
    });

    twoClient.request({
        hasNoParent: true,
        headers: {
            as: 'raw',
            cn: 'wat'
        }
    }).send('decline', 'foo', 'bar', function done(err, res, arg2, arg3) {
        assert.equal(err.type, 'tchannel.declined', 'expected declined error');

        assert.ok(cluster.logger.items().length >= 1);
        client.close();
        assert.end();
    });

    function declineError(req, res, arg2, arg3) {
        res.sendError('Declined', 'lul');
    }
});

function echo(req, res, arg2, arg3) {
    res.headers.as = 'raw';
    res.sendOk(arg2, arg3);
}

RelayNetwork.test('relay through a network', {
    serviceNames: ['alice', 'bob'],
    numInstancesPerService: 1,
    kValue: 1,
    numRelays: 2
}, function t(network, assert) {
    network.forEachSubChannel(function register(c, service, index) {
        c.register('ping', function ping(req, res) {
            res.headers.as = 'raw';
            res.sendOk('' + index, service);
        });
    });

    network.subChannelsByName.alice[0].request({
        hasNoParent: true,
        serviceName: 'bob',
        headers: {
            cn: 'alice',
            as: 'raw'
        }
    }).send('ping', 'foo', 'bar', function onResponse(err, res, arg2, arg3) {
        if (err) {
            return assert.end(err);
        }
        assert.equal(arg3.toString(), 'bob',
            'response relayed to and from requested service');
        assert.end();
    });
});

RelayNetwork.test('relay respects relayFlags', {
    serviceNames: ['alice', 'bob'],
    numInstancesPerService: 3,
    kValue: 1,
    numRelays: 2
}, function t(network, assert) {
    network.cluster.logger.whitelist('warn', 'forwarding error frame');

    var counters = {
        alice: 0,
        bob: 0
    };

    network.forEachSubChannel(function register(c, service) {
        c.register('ping', function ping(req, res) {
            counters[service]++;
            res.sendError('UnexpectedError', 'oops');
        });
    });

    network.subChannelsByName.alice[0].request({
        hasNoParent: true,
        serviceName: 'bob',
        headers: {
            cn: 'alice',
            as: 'raw'
        },
        retryFlags: {
            never: true
        }
    }).send('ping', 'foo', 'bar', onResponse);

    function onResponse(err, res, arg2, arg3) {
        assert.ok(err);
        assert.equal(err.message, 'oops');

        assert.equal(counters.alice, 0);
        assert.equal(counters.bob, 1);

        assert.end();
    }
});

RelayNetwork.test('relay network changes dont break', {
    serviceNames: ['alice', 'bob'],
    numInstancesPerService: 1,
    kValue: 1,
    numRelays: 2
}, function t(network, assert) {
    network.cluster.logger.whitelist('info', 'Changing to forward node');

    var aliceHosts = network.topology.alice;
    var bobHosts = network.topology.bob;
    network.topology.bob = aliceHosts;
    network.topology.alice = bobHosts;

    var ready = CountedReady(2);

    network.relayChannels[0].handler.roleTransitionEvent
        .on(function forwardChange(stuff) {
            assert.equals(stuff.newMode, 'forward');
            ready.signal();
        });

    network.relayChannels[1].handler.roleTransitionEvent
        .on(function forwardChange(stuff) {
            assert.equals(stuff.newMode, 'forward');
            ready.signal();
        });

    network.egressNodesForRelay[0].membershipChangedEvent.emit();
    network.egressNodesForRelay[1].membershipChangedEvent.emit();

    ready(assert.end);
});
