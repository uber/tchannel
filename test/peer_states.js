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

var series = require('run-series');
var parallel = require('run-parallel');
var MockTimers = require('time-mock');
var allocCluster = require('./lib/alloc-cluster.js');
var States = require('../states');

function testSetup(desc, options, testFunc) {
    allocCluster.test(desc, allocClusterOptions(options), function t(cluster, assert) {
        runTest(testFunc, cluster, assert);
    });
}

testSetup.only = function onlyTestSetup(desc, options, testFunc) {
    allocCluster.test.only(desc, allocClusterOptions(options), function t(cluster, assert) {
        runTest(testFunc, cluster, assert);
    });
};

allocCluster.test('healthy state stays healthy', {
    numPeers: 2,
    channelOptions: {
        timers: MockTimers(Date.now()),
        random: winning,
        peerOptions: {
            initialState: States.HealthyState
        }
    },
}, function t(cluster, assert) {
    var one = cluster.channels[0];
    var peer = one.peers.add(cluster.hosts[1]);

    assert.equals(peer.state.type, 'tchannel.healthy', 'initially healthy');
    assert.equals(peer.state.shouldRequest(), 0.4, 'got not connected score');
    assert.equals(peer.state.type, 'tchannel.healthy', 'still healthy');

    var conn = peer.connect();
    assert.equals(peer.state.shouldRequest(), 0.4, 'got connecting score');
    assert.equals(peer.state.type, 'tchannel.healthy', 'still healthy');

    conn.on('identified', function onId() {
        assert.equals(peer.state.shouldRequest(), 1.0, 'got identified score');
        assert.equals(peer.state.type, 'tchannel.healthy', 'still healthy');

        assert.end();
    });
});

testSetup('stays healthy with partial success', {}, function t(cluster, assert) {
    var peer = cluster.client.peers.get(cluster.hosts[1]);

    series([
        function checkIt(done) {
            assert.equals(peer.state.shouldRequest(), 1.0, 'expected fully connected score');
            assert.equals(peer.state.type, 'tchannel.healthy', 'still healthy');
            done();
        },

        function sendIt(done) {
            parallel([
                // 50%ok/50%nok is ultimately okay with a threshold of .5
                cluster.send('glad'),
                cluster.send('sad'),
                cluster.send('glad'),
                cluster.send('sad'),
                cluster.send('glad'),
                cluster.send('sad')
            ], done);
        },

        function checkItAgain(done) {
            peer.channel.timers.advance(1000);
            assert.equals(peer.state.shouldRequest(), 1.0, 'expected fully connected score');
            assert.equals(peer.state.type, 'tchannel.healthy', 'still healthy');
            done();
        }
    ], assert.end);
});

testSetup('stays healthy with complete success when locked', {
    initialPeerState: States.LockedHealthyState
}, function t(cluster, assert) {
    var peer = cluster.client.peers.get(cluster.hosts[1]);

    series([
        function checkIt(done) {
            assert.equals(peer.state.shouldRequest(), 1.0, 'expected fully connected score');
            assert.equals(peer.state.type, 'tchannel.healthy-locked', 'locked healthy');
            done();
        },

        function sendIt(done) {
            parallel([
                cluster.send('sad'),
                cluster.send('sad'),
                cluster.send('sad')
            ], done);
        },

        function checkItAgain(done) {
            peer.channel.timers.advance(1000);
            assert.equals(peer.state.shouldRequest(), 1.0, 'expected fully connected score');
            assert.equals(peer.state.type, 'tchannel.healthy-locked', 'still locked healthy');
            done();
        }
    ], assert.end);
});

testSetup('healthy goes unhealthy with partial success', {}, function t(cluster, assert) {
    var peer = cluster.client.peers.get(cluster.hosts[1]);

    series([
        function checkIt(done) {
            assert.equals(peer.state.shouldRequest(), 1.0, 'expected fully connected score');
            assert.equals(peer.state.type, 'tchannel.healthy', 'still healthy');
            done();
        },

        function sendIt(done) {
            // 1ok : 2nok
            parallel([
                cluster.send('glad'),
                cluster.send('sad'),
                cluster.send('sad'),
            ], done);
        },

        function checkItAgain(done) {
            peer.channel.timers.advance(1000);
            assert.equals(peer.state.shouldRequest(), 0.0, 'expected unhealthy score');
            assert.equals(peer.state.type, 'tchannel.unhealthy', 'expected unhealthy');
            done();
        }
    ], assert.end);
});

testSetup('one check per period while unhealthy', {}, function t(cluster, assert) {
    var peer = cluster.client.peers.get(cluster.hosts[1]);

    series([

        function failIt(done) {
            parallel([
                cluster.send('sad'),
                cluster.send('sad')
            ], done);
        },

        function checkIt(done) {
            peer.channel.timers.advance(1000);
            assert.equals(peer.state.shouldRequest(), 0.0, 'expected unhealthy score');
            assert.equals(peer.state.type, 'tchannel.unhealthy', 'expected unhealthy');

            peer.channel.timers.advance(1000);
            assert.equals(peer.state.shouldRequest(), 1.0, 'expected probe score');
            assert.ok(peer.state.shouldRequest(), 'first request allowed');

            done();
        },

        cluster.send('glad'),

        function checkFirst(done) {
            assert.equals(peer.state.type, 'tchannel.unhealthy');
            assert.equals(peer.state.shouldRequest(), 0.0, 'expected unhealthy score');

            done();
        }

    ], assert.end);
});

testSetup('consecutive success during unhealthy periods restores health', {}, function t(cluster, assert) {
    var peer = cluster.client.peers.get(cluster.hosts[1]);

    var Steps = [
        function failIt(done) {
            parallel([
                cluster.send('sad'),
                cluster.send('sad')
            ], done);
        },

        function checkIt(done) {
            peer.channel.timers.advance(1000);
            assert.equals(peer.state.shouldRequest(), 0.0, 'expected unhealthy score');
            assert.equals(peer.state.type, 'tchannel.unhealthy', 'expected unhealthy');

            done();
        }
    ];

    [1, 2, 3, 4, 5].forEach(function each(trial) {Steps.push(

        function checkBefore(done) {
            peer.channel.timers.advance(1000);
            assert.equals(peer.state.shouldRequest(), 1.0, 'expected probe score before try ' + trial);
            assert.equals(peer.state.type, 'tchannel.unhealthy', 'unhealthy before try ' + trial);

            done();
        },

        cluster.send('glad'),

        function checkAfter(done) {
            assert.equals(peer.state.shouldRequest(), 0.0, 'expected unhealthy score after try ' + trial);
            assert.equals(peer.state.type, 'tchannel.unhealthy', 'unhealthy after try ' + trial);

            done();
        }

    );});

    Steps.push(
        function fastForward(done) {
            peer.channel.timers.advance(1000);
            done();
        },

        cluster.send('glad'),
        cluster.send('glad'),

        function checkFinal(done) {
            assert.equals(peer.state.shouldRequest(), 1.0, 'expected healthy score', 'expected healthy score');
            assert.equals(peer.state.type, 'tchannel.healthy', 'probed back to health');

            done();
        });

    series(Steps, assert.end);

});

testSetup('consecutive success (WITH PAUSES) during unhealthy periods restores health', {}, function t(cluster, assert) {
    var peer = cluster.client.peers.get(cluster.hosts[1]);

    var Steps = [
        function failIt(done) {
            parallel([
                cluster.send('sad'),
                cluster.send('sad')
            ], done);
        },

        function checkIt(done) {
            peer.channel.timers.advance(1000);
            assert.equals(peer.state.shouldRequest(), 0.0, 'expected unhealthy score');
            assert.equals(peer.state.type, 'tchannel.unhealthy', 'expected unhealthy');

            done();
        }
    ];

    [1, 2, 3, 4, 5].forEach(function each(trial) {Steps.push(

        function checkBefore(done) {
            peer.channel.timers.advance(1000);
            assert.equals(peer.state.shouldRequest(), 1.0, 'expected probe score before try ' + trial);
            assert.equals(peer.state.type, 'tchannel.unhealthy', 'unhealthy before try ' + trial);

            done();
        },

        cluster.send('glad'),

        function checkAfter(done) {
            assert.equals(peer.state.shouldRequest(), 0.0, 'expected unhealthy score after try ' + trial);
            assert.equals(peer.state.type, 'tchannel.unhealthy', 'unhealthy after try ' + trial);
            peer.channel.timers.advance(2000);

            done();
        }

    );});

    Steps.push(
        function fastForward(done) {
            peer.channel.timers.advance(1000);
            done();
        },

        cluster.send('glad'),
        cluster.send('glad'),

        function checkFinal(done) {
            assert.equals(peer.state.shouldRequest(), 1.0, 'expected healthy score', 'expected healthy score');
            assert.equals(peer.state.type, 'tchannel.healthy', 'probed back to health');

            done();
        });

    series(Steps, assert.end);

});

function allocClusterOptions(options) {
    return {
        numPeers: 2,
        channelOptions: {
            timers: MockTimers(Date.now()),
            random: winning,
            peerOptions: {
                initialState: options.initialPeerState || States.HealthyState
            },
            requestDefaults: {
                headers: {
                    as: 'raw',
                    cn: 'wat'
                }
            }
        },
    };
}

function runTest(testFunc, cluster, assert) {
    var one = cluster.channels[0];
    var two = cluster.channels[1];

    var client = one.makeSubChannel({
        serviceName: 'tiberius'
    });
    var service = two.makeSubChannel({
        serviceName: 'tiberius'
    });
    var peer = client.peers.add(cluster.hosts[1]);
    // manually set minRequests requirement to 0
    peer.state.minRequests = 0;
    service.register('glad', function(req, res) {
        res.headers.as = 'raw';
        res.sendOk('pool', 'party');
    });
    service.register('sad', function(req, res) {
        res.sendError('UnexpectedError', '<sad trombone>');
    });

    cluster.client = client;
    cluster.service = service;
    cluster.send = function send(op) {
        return function runSendTest(callback) {
            client.request({
                serviceName: 'tiberius', 
                hasNoParent: true
            }).send(op, '', '', onResult);
            function onResult(err, res, arg2, arg3) {
                callback(null, {
                    error: err,
                    ok: res && res.ok,
                    arg2: arg2,
                    arg3: arg3
                });
            }
        };
    };

    var conn = peer.connect();
    conn.on('error', assert.end);
    conn.on('identified', function gotId() {
        testFunc(cluster, assert);
    });
}

function winning() {
    return 1.0;
}
