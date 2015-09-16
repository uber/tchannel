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

var collectParallel = require('collect-parallel/array');

var allocCluster = require('./lib/alloc-cluster.js');

allocCluster.test('immediate drain', {
    numPeers: 4,
    skipEmptyCheck: true
}, function t(cluster, assert) {
    var server = cluster.channels[0];
    setupTestClients(cluster, ['a'], runTest);
    setupServiceServer(server, 'a', 5);

    function runTest(err) {
        if (err) {
            finish(err);
            return;
        }

        assert.timeoutAfter(50);
        server.drain('testdown', drained);
    }

    function drained() {
        assert.pass('immediate drain happened');
        waitForConnRemoved(6, cluster, finish);
        server.close(closed);
    }

    function closed(err) {
        if (err) {
            finish(err);
            return;
        }
        assert.pass('server closed');
    }

    function finish(err) {
        checkFinish(assert, err, cluster, 1);
    }
});

allocCluster.test('drain server with a few incoming', {
    numPeers: 4,
    skipEmptyCheck: true
}, function t(cluster, assert) {
    var server = cluster.channels[0];
    var clients = null;
    var finishCount = 0;
    var reqN = 0;
    setupTestClients(cluster, ['a'], runTest);
    setupServiceServer(server, 'a', 5);

    function runTest(err, gotClients) {
        if (err) {
            finish(err);
            return;
        }
        clients = gotClients;

        finishCount = 2;
        assert.timeoutAfter(50);
        collectParallel(clients.a, sendOne, sendsDone);

        setTimeout(testdown, 1);
    }

    function testdown() {
        assert.comment('triggering drain');
        assert.equal(finishCount, 2, 'requests have not finished');
        server.drain('testdown', drained);
        finishCount++;
        collectParallel(clients.a, sendOne, afterDrainSendsDone);
    }

    function sendOne(client, _, done) {
        reqN++;
        assert.comment('sending request ' + reqN);
        client.request().send('echo', 'such', 'mess' + reqN, done);
    }

    function sendsDone(err, res) {
        if (err) {
            finish(err);
            return;
        }

        for (var i = 0; i < res.length; i++) {
            assert.ifError(res[i].err, 'res[' + i + ']: no error');
            assert.equal(
                res[i].value &&
                String(res[i].value.arg3), 'mess' + (i + 1),
                'res[' + i + ']: expected arg3');
        }

        finish();
    }

    function afterDrainSendsDone(err, res) {
        if (err) {
            finish(err);
            return;
        }

        for (var i = 0; i < res.length; i++) {
            assert.equal(
                res[i].err && res[i].err.type,
                'tchannel.declined',
                'res[' + i + ']: expected declined');
            assert.equal(res[i].value, null, 'res[' + i + ']: no value');
        }

        finish();
    }

    function drained() {
        assert.pass('drain happened');
        waitForConnRemoved(6, cluster, finish);
        server.close(closed);
    }

    function closed(err) {
        if (err) {
            finish(err);
            return;
        }

        assert.pass('server closed');
    }

    function finish(err) {
        finishCount = checkFinish(assert, err, cluster, finishCount);
    }
});

allocCluster.test('drain server with a few incoming (with exempt service)', {
    numPeers: 4,
    skipEmptyCheck: true
}, function t(cluster, assert) {

    cluster.logger.whitelist('info', 'draining channel');
    cluster.logger.whitelist('info', 'ignoring outresponse.send on a closed connection');

    var server = cluster.channels[0];
    var clients = null;
    var finishCount = 0;
    var reqN = 0;
    setupTestClients(cluster, ['a', 'b'], runTest);
    setupServiceServer(server, 'a', 5);
    setupServiceServer(server, 'b', 5);

    function runTest(err, gotClients) {
        if (err) {
            finish(err);
            return;
        }
        clients = gotClients;

        assert.timeoutAfter(50);

        finishCount++;
        collectParallel(clients.a, sendOne, checkSendsDone('service:a', checkASend, finish));

        finishCount++;
        collectParallel(clients.b, sendOne, checkSendsDone('service:b', checkBSend, finish));

        setTimeout(testdown, 1);

        function checkASend(desc, res, i) {
            assert.ifError(res.err, desc + 'no error');
            assert.equal(res.value && String(res.value.arg3), 'mess' + (i + 1),
                         desc + 'expected arg3');
        }

        function checkBSend(desc, res, i) {
            if (res.err) {
                assert.ok(res.err.type === 'tchannel.connection.reset' ||
                    res.err.type === 'tchannel.request.timeout',
                    desc + 'expected connection reset or request timeout error');
            } else {
                assert.equal(String(res.value.arg3), 'mess' + (i + 4),
                             desc + 'expected arg3');
            }
        }
    }

    function testdown() {
        assert.comment('triggering drain');
        assert.equal(finishCount, 2, 'requests have not finished');

        finishCount++;
        server.drain('testdown', drainExemptB, drained);

        finishCount++;
        collectParallel(clients.a, sendOne, checkSendsDone('service:a', checkADecline, finish));

        finishCount++;
        collectParallel(clients.b, sendOne, checkSendsDone('service:b', checkBRes, finish));

        function checkADecline(desc, res, i) {
            assert.equal(res.err && res.err.type, 'tchannel.declined',
                         desc + 'expected declined');
            assert.equal(res.value, null,
                         desc + 'no value');
        }

        function checkBRes(desc, res, i) {
            if (res.err) {
                assert.ok(res.err.type === 'tchannel.connection.reset' ||
                    res.err.type === 'tchannel.request.timeout',
                    desc + 'expected connection reset error');
            } else {
                assert.equal(String(res.value.arg3), 'mess' + (i + 10),
                             desc + 'expected arg3');
            }
        }
    }

    function drainExemptB(req) {
        return req.serviceName === 'b';
    }

    function sendOne(client, _, done) {
        reqN++;
        assert.comment('sending request ' + reqN);
        client.request().send('echo', 'such', 'mess' + reqN, done);
    }

    function drained() {
        assert.pass('drain happened');
        server.close(closed);
    }

    function closed(err) {
        if (err) {
            finish(err);
            return;
        }
        assert.pass('server closed');

        var logs = cluster.logger.items().map(function eachLog(log) {
            return {
                level: log.levelName,
                msg: log.msg
            };
        });

        assert.ok(logs.length > 0, 'expected some logs');
        assert.deepEqual(logs[0], {
            level: 'info',
            msg: 'draining channel'
        }, 'expected draining log');

        for (var i = 1; i < logs.length; i++) {
            assert.deepEqual(logs[i], {
                level: 'info',
                msg: 'ignoring outresponse.send on a closed connection'
            }, 'expected zero or more sends after close');
        }

        setTimeout(finish, 1);
    }

    function finish(err) {
        finishCount = checkFinish(assert, err, cluster, finishCount);
    }
});

allocCluster.test('drain client with a few outgoing', {
    numPeers: 4,
    skipEmptyCheck: true
}, function t(cluster, assert) {
    var server = cluster.channels[0];
    var drainClient = cluster.channels[1];
    var clients = null;
    var finishCount = 0;
    var reqN = 0;
    setupTestClients(cluster, ['a'], runTest);
    setupServiceServer(server, 'a', 5);

    function runTest(err, gotClients) {
        if (err) {
            finish(err);
            return;
        }
        clients = gotClients;

        finishCount = 2;
        assert.timeoutAfter(50);
        collectParallel(clients.a, sendOne, sendsDone);

        setTimeout(testdown, 1);
    }

    function testdown() {
        assert.comment('triggering drain');
        assert.equal(finishCount, 2, 'requests have not finished');
        drainClient.drain('testdown', drained);
        finishCount++;
        collectParallel(clients.a, sendOne, afterDrainSendsDone);
    }

    function sendOne(client, _, done) {
        reqN++;
        assert.comment('sending request ' + reqN);
        client.request().send('echo', 'such', 'mess' + reqN, done);
    }

    function sendsDone(err, res) {
        if (err) {
            finish(err);
            return;
        }

        for (var i = 0; i < res.length; i++) {
            assert.ifError(res[i].err, 'res[' + i + ']: no error');
            assert.equal(
                res[i].value &&
                String(res[i].value.arg3), 'mess' + (i + 1),
                'res[' + i + ']: expected arg3');
        }

        finish();
    }

    function afterDrainSendsDone(err, res) {
        if (err) {
            finish(err);
            return;
        }

        assert.equal(
            res[0].err && res[0].err.type,
            'tchannel.request.drained',
            'res[0]: expected request drained');
        assert.equal(res[0].value, null, 'res[0]: no value');

        for (var i = 1; i < res.length; i++) {
            assert.ifError(res[i].err, 'res[' + i + ']: no error');
            assert.equal(
                res[i].value &&
                String(res[i].value.arg3), 'mess' + (i + 4),
                'res[' + i + ']: expected arg3');
        }

        finish();
    }

    function drained() {
        assert.pass('drain happened');
        waitForConnRemoved(2, cluster, finish);
        drainClient.close(closed);
    }

    function closed(err) {
        if (err) {
            finish(err);
            return;
        }

        assert.pass('client closed');
    }

    function finish(err) {
        assert.ifError(err, 'no unexpected error');

        if (--finishCount === 0) {
            // cluster.assertEmptyState(assert);
            // return;

            cluster.assertCleanState(assert, {
                channels: [
                    // server has no peers
                    {peers: [
                        {connections: []},
                        {connections: [
                            {
                                direction: 'in',
                                inReqs: 0,
                                outReqs: 0,
                                streamingReq: 0,
                                streamingRes: 0
                            }
                        ]},
                        {connections: [
                            {
                                direction: 'in',
                                inReqs: 0,
                                outReqs: 0,
                                streamingReq: 0,
                                streamingRes: 0
                            }
                        ]}
                    ]},
                    // all client connections closed
                    {peers: []},
                    {peers: [{connections: [
                        {
                            direction: 'out',
                            inReqs: 0,
                            outReqs: 0,
                            streamingReq: 0,
                            streamingRes: 0
                        }
                    ]}]},
                    {peers: [{connections: [
                        {
                            direction: 'out',
                            inReqs: 0,
                            outReqs: 0,
                            streamingReq: 0,
                            streamingRes: 0
                        }
                    ]}]}
                ]
            });

            assert.end();
        }
    }
});

allocCluster.test('drain client with a few outgoing (with exempt service)', {
    numPeers: 4,
    skipEmptyCheck: true
}, function t(cluster, assert) {
    var server = cluster.channels[0];
    var drainClient = cluster.channels[1];
    var clients = null;
    var finishCount = 0;
    var reqN = 0;
    setupTestClients(cluster, ['a', 'b'], runTest);
    setupServiceServer(server, 'a', 5);
    setupServiceServer(server, 'b', 5);

    cluster.logger.whitelist('info', 'resetting connection');
    // cluster.logger.whitelist('info', 'ignoring outresponse.send on a closed connection');

    function runTest(err, gotClients) {
        if (err) {
            finish(err);
            return;
        }
        clients = gotClients;

        assert.timeoutAfter(50);

        finishCount++;
        collectParallel(clients.a, sendOne, checkSendsDone('service:a', checkASend, finish));

        finishCount++;
        collectParallel(clients.b, sendOne, checkSendsDone('service:b', checkBSend, finish));

        setTimeout(testdown, 1);

        function checkASend(desc, res, i) {
            assert.ifError(res.err, desc + 'no error');
            assert.equal(res.value && String(res.value.arg3), 'mess' + (i + 1),
                         desc + 'expected arg3');
        }

        function checkBSend(desc, res, i) {
            if (res.err) {
                assert.ok(res.err.type === 'tchannel.local.reset' ||
                    res.err.type === 'request.timeout',
                    desc + 'expected local reset or request timeout error');
            } else {
                assert.equal(String(res.value.arg3), 'mess' + (i + 4),
                             desc + 'expected arg3');
            }
        }
    }

    function testdown() {
        assert.comment('triggering drain');
        assert.equal(finishCount, 2, 'requests have not finished');

        finishCount++;
        drainClient.drain('testdown', drainExemptB, drained);

        finishCount++;
        collectParallel(clients.a, sendOne, checkSendsDone('service:a', checkADecline, finish));

        finishCount++;
        collectParallel(clients.b, sendOne, checkSendsDone('service:b', checkBRes, finish));

        function checkADecline(desc, res, i) {
            if (i === 0) {
                assert.equal(res.err && res.err.type, 'tchannel.request.drained',
                             desc + 'expected request drained');
                assert.equal(res.value, null,
                             desc + 'no value');
            } else {
                assert.ifError(res.err, desc + 'no error');
                assert.equal(res.value && String(res.value.arg3), 'mess' + (i + 7),
                             desc + 'expected arg3');
            }
        }

        function checkBRes(desc, res, i) {
            if (res.err) {
                assert.equal(res.err.type, 'tchannel.local.reset',
                             desc + 'expected local reset error');
            } else {
                assert.equal(String(res.value.arg3), 'mess' + (i + 10),
                             desc + 'expected arg3');
            }
        }
    }

    function drainExemptB(req) {
        return req.serviceName === 'b';
    }

    function sendOne(client, _, done) {
        reqN++;
        assert.comment('sending request ' + reqN);
        client.request().send('echo', 'such', 'mess' + reqN, done);
    }

    function drained() {
        assert.pass('drain happened');
        waitForConnRemoved(2, cluster, finish);
        drainClient.close(closed);
    }

    function closed(err) {
        if (err) {
            finish(err);
            return;
        }

        assert.pass('client closed');
    }

    function checkLogs() {
        var logs = cluster.logger.items().map(function eachLog(log) {
            return {
                level: log.levelName,
                msg: log.msg
            };
        });

        // TODO: why not always get log
        if (logs.length > 0) {
            assert.deepEqual(logs[0], {
                level: 'info',
                msg: 'resetting connection'
            }, 'expected resetting connection log');
        }
    }

    function finish(err) {
        assert.ifError(err, 'no unexpected error');

        if (--finishCount === 0) {
            // cluster.assertEmptyState(assert);
            // return;

            checkLogs();

            cluster.assertCleanState(assert, {
                channels: [
                    // server has no peers
                    {peers: [
                        {connections: []},
                        {connections: [
                            {
                                direction: 'in',
                                inReqs: 0,
                                outReqs: 0,
                                streamingReq: 0,
                                streamingRes: 0
                            }
                        ]},
                        {connections: [
                            {
                                direction: 'in',
                                inReqs: 0,
                                outReqs: 0,
                                streamingReq: 0,
                                streamingRes: 0
                            }
                        ]}
                    ]},
                    // all client connections closed
                    {peers: []},
                    {peers: [{connections: [
                        {
                            direction: 'out',
                            inReqs: 0,
                            outReqs: 0,
                            streamingReq: 0,
                            streamingRes: 0
                        }
                    ]}]},
                    {peers: [{connections: [
                        {
                            direction: 'out',
                            inReqs: 0,
                            outReqs: 0,
                            streamingReq: 0,
                            streamingRes: 0
                        }
                    ]}]}
                ]
            });

            assert.end();
        }
    }
});

// TODO: test draining of outgoing reqs
// TODO: currently the exempt test provokes mismatched onReqDone callback warn logs

function setupTestClients(cluster, services, callback) {
    var i;
    var clients = {};
    var serverRoot = cluster.channels[0];

    for (i = 0; i < services.length; i++) {
        var service = services[i];
        var clis = clients[service] = [];
        for (var j = 1; j < cluster.channels.length; j++) {
            var client = setupServiceClient(cluster.channels[j], service);
            clis.push(client);
            client.peers.add(serverRoot.hostPort);
        }
    }

    collectParallel(cluster.channels.slice(1), idEach, ided);

    function idEach(chan, i, done) {
        var peer = chan.peers.add(serverRoot.hostPort);
        peer.waitForIdentified(done);
    }

    function ided(err, res) {
        for (var i = 0; i < res.length; i++) {
            if (res[i].err) {
                callback(err, clients);
                return;
            }
        }
        callback(null, clients);
    }
}

function setupServiceServer(rootchan, service, delay) {
    var chan = rootchan.makeSubChannel({
        serviceName: service
    });
    chan.register('echo', echo);

    return chan;

    function echo(req, res, arg2, arg3) {
        req.channel.timers.setTimeout(respond, delay);

        function respond() {
            res.headers.as = 'raw';
            res.send(arg2, arg3);
        }
    }
}

function setupServiceClient(rootchan, service) {
    return rootchan.makeSubChannel({
        serviceName: service,
        requestDefaults: {
            timeout: 100,
            hasNoParent: true,
            retryflags: {
                never: true
            },
            serviceName: service,
            headers: {
                as: 'raw',
                cn: service + 'Client'
            }
        }
    });
}

function checkSendsDone(name, check, callback) {
    return sendsDone;

    function sendsDone(err, res) {
        if (err) {
            callback(err);
            return;
        }
        for (var i = 0; i < res.length; i++) {
            var desc = name + ' res[' + i + ']: ';
            check(desc, res[i], i);
        }
        callback();
    }
}

function checkFinish(assert, err, cluster, finishCount) {
    assert.ifError(err, 'no unexpected error');

    if (--finishCount === 0) {
        cluster.assertCleanState(assert, {
            channels: [
                // server has no peers
                {peers: []},
                // all client connections closed
                {peers: [{connections: []}]},
                {peers: [{connections: []}]},
                {peers: [{connections: []}]}
            ]
        });

        assert.end();
    }

    return finishCount;
}

function waitForConnRemoved(count, cluster, callback) {
    cluster.channels.forEach(function eachChannel(chan) {
        var peers = chan.peers.values();
        peers.forEach(function eachPeer(peer) {
            peer.on('removeConnection', removed);
        });
    });

    function removed() {
        if (--count === 0) {
            callback();
        }
    }
}
