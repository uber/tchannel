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

var parallel = require('run-parallel');
var Result = require('bufrw/result');
var MockTimers = require('time-mock');
var allocCluster = require('./lib/alloc-cluster');

testBattle('cap maximum pending requests', {
    numPeers: 2,
    channelOptions: {
        maxPending: 2,
        timers: MockTimers(Date.now()),
        random: lucky,
        requestDefaults: {
            trackPending: true
        }
    }
}, [
    // TODO wtf please no connection timeout
    'tchannel.connection.timeout',
    'tchannel.max-pending'
]);

testBattle('cap maximum pending requests per service', {
    numPeers: 2,
    channelOptions: {
        maxPendingForService: 2,
        timers: MockTimers(1.5e12), // approximately soon
        random: lucky,
        requestDefaults: {
            trackPending: true
        }
    }
}, [
    'tchannel.connection.timeout',
    'tchannel.max-pending-for-service'
]);

testBattle('channel-scoped max pending supercedes per-service', {
    numPeers: 2,
    channelOptions: {
        maxPending: 2,
        maxPendingForService: 2,
        timers: MockTimers(1.5e12), // approximately soon
        random: lucky,
        requestDefaults: {
            trackPending: true
        }
    }
}, [
    'tchannel.connection.timeout',
    'tchannel.max-pending'
]);

testBattle('do not opt-in for pending request tracking', {
    numPeers: 2,
    channelOptions: {
        maxPending: 1,
        timers: MockTimers(Date.now()),
        random: lucky
    }
}, [
    'tchannel.connection.timeout',
    'tchannel.connection.timeout'
]);

function testBattle(name, options, expectedErrorTypes) {
    allocCluster.test(name, options, function t(cluster, assert) {
        var tweedleDee = cluster.channels[0];
        var tweedleDum = cluster.channels[1];
        var timers = tweedleDee.timers;

        var deeChannel = tweedleDee.makeSubChannel({
            serviceName: 'battle'
        });
        var dumChannel = tweedleDum.makeSubChannel({
            serviceName: 'battle'
        });

        dumChannel.peers.add(tweedleDee.hostPort);

        deeChannel.register('start', function start() {
            // Let's just say we did
        });

        parallel([challengeSender(), challengeSender()], function verifyIt(err, results) {
            if (err) return assert.end(err);
            assert.equals(results[0].err.type, expectedErrorTypes[0], 'first should fail due to a timeout');
            assert.equals(results[1].err.type, expectedErrorTypes[1], 'second should fail because max pending exceeded');
            assert.end();
        });

        // TODO ascertain why this test stalls non-deterministically, and with
        // increasing probability, for values from 2000ms down to 1000ms.
        timers.advance(2100);

        function challengeSender() {
            return function sendChallenge(cb) {
                dumChannel.request({
                    serviceName: 'battle',
                    headers: {
                        as: 'raw'
                    },
                    timeout: 1000
                }).send('start', '', '', regardless(cb));
            };
        }

        function regardless(cb) {
            return function resultRegardless(err, value) {
                return cb(null, new Result(err, value));
            };
        }
    });
}

function lucky() {
    return 1.0;
}
