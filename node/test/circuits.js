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
var parallel = require('run-parallel');

var relayCount = 3;
var serviceNames = ['alice', 'bob', 'charlie'];
var numInstances = 3;

RelayNetwork.test('', {
    channel: {
        initialPeerState: States.LockedHealthyState
    },
    cluster: {
        logger: debugLogtron('tchannel', {enabled: false})
    },
    serviceNames: ['alice', 'bob', 'charlie'],
    numInstancesPerService: 3,
    numRelays: 3,
    kValue: 2,
    createCircuits: function createCircuits(options) {
        return new Circuits(options);
    },
}, function t(network, assert) {
    network.forEachSubChannel(function registerHanlder(subChannel, serviceName, instanceIndex) {
        subChannel.handler.register('echo', function (req, res) {
            if (instanceIndex === 0) {
                res.headers.as = 'raw';
                res.sendOk('', serviceName + instanceIndex);
            } else {
                res.sendError('UnexpectedError', 'no result for you');
            }
        });
    });

    parallel(['charlie', 'charlie', 'charlie', 'charlie', 'bob', 'bob', 'alice'].map(function (serviceName, n) {
        return function (callback) {
            var aliceChannel = network.subChannelsByName.alice[0];
            aliceChannel.peers.add(network.relayChannels[0].hostPort);
            aliceChannel.request({
                serviceName: serviceName,
                headers: {
                    as: 'raw',
                    cn: 'alice'
                },
                hasNoParent: true
            }).send('echo', 'tiny head', 'HUGE BODY', onResponse);

            function onResponse(err, res, arg2, arg3) {
                setTimeout(onTimeout, 1000);
                function onTimeout() {
                    network.relayChannels.forEach(function (relayChannel) {
                        var circuits = relayChannel.handler.circuits;
                        var circuit = circuits.getCircuit('alice', 'charlie', 'echo');
                        console.log(circuit.state.type);
                    });
                    callback();
                }
            }

        };
    }), assert.end);
});
