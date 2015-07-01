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

var debugLogtron = require('debug-logtron');
var RelayNetwork = require('./lib/relay_network.js');
var Circuits = require('../circuits');
var States = require('../states');
var MockTimers = require('time-mock');

RelayNetwork.test('should switch to unhealthy', {
    timers: new MockTimers(1e9),
    clusterOptions: {
        logger: debugLogtron('tchannel', {enabled: false}),
        peerOptions: {
            // Pin down the peer states
            initialState: States.LockedHealthyState
        }
    },
    serviceNames: ['alice', 'bob'],
    numInstancesPerService: 1,
    numRelays: 1,
    kValue: 1,
    createCircuits: function createCircuits(options) {
        return new Circuits({
            timers: options.timers,
            period: 500
        });
    }
}, function t(network, assert) {

    network.forEachSubChannel(function registerHanlder(subChannel, serviceName, instanceIndex) {
        subChannel.handler.register('echo', function (req, res) {
            res.sendError('UnexpectedError', 'no result for you ' + instanceIndex);
        });
    });

    var declined = 0;
    var unexpected = 0;

    function tick(count, delay, callback) {
        var aliceChannel = network.subChannelsByName.alice[0];
        aliceChannel.peers.add(network.relayChannels[0].hostPort);
        aliceChannel.request({
            serviceName: 'bob',
            headers: {
                as: 'raw',
                cn: 'alice'
            },
            hasNoParent: true
        }).send('echo', 'tiny head', 'HUGE BODY', onResponse);

        function onResponse(err) {
            if (err.codeName === 'UnexpectedError') {
                unexpected++;
            } else if (err.codeName === 'Declined') {
                declined++;
            }
            network.timers.advance(100);

            if (count) {
                tick(count - 1, delay, callback);
            } else {
                callback();
            }
        }
    }

    tick(100, 100, onCompletion);

    function onCompletion(err) {
        if (err) return assert.end(err);

        assert.ok(declined > 70, 'should largely decline when unhealthy');
        assert.ok(unexpected > 20, 'should trickle original error');

        assert.end();
    }
});
