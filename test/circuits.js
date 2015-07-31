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
var States = require('../states');
var MockTimers = require('time-mock');
var CountedReadySignal = require('ready-signal/counted');

var aliceAndBob = {
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
    circuitsConfig: {
        enabled: true,
        period: 500
    }
};

var aliceBobCharlie = {
    timers: new MockTimers(1e9),
    clusterOptions: {
        logger: debugLogtron('tchannel', {enabled: false}),
        peerOptions: {
            // Pin down the peer states
            initialState: States.LockedHealthyState
        }
    },
    serviceNames: ['alice', 'bob', 'charlie'],
    numInstancesPerService: 1,
    numRelays: 1,
    kValue: 1,
    circuitsConfig: {
        enabled: true,
        period: 500
    }
};

RelayNetwork.test('should switch to unhealthy', aliceAndBob, function t(network, assert) {

    network.register('call', function (req, res) {
        res.sendError('UnexpectedError', 'head splode');
    });

    network.cluster.logger.whitelist('warn', 'circuit became unhealthy');

    var declined = 0;
    var unexpected = 0;

    network.exercise(100, 100, eachRequest, eachResponse, onCompletion);

    function eachRequest(callback) {
        network.send({
            callerName: 'alice',
            serviceName: 'bob'
        }, 'call', 'tiny head', 'HUGE BODY', callback);
    }

    function eachResponse(err, res) {
        if (err.codeName === 'UnexpectedError') {
            unexpected++;
        } else if (err.codeName === 'Declined') {
            declined++;
        }
    }

    function onCompletion(err) {
        if (err) return assert.end(err);

        var items = network.cluster.logger.items();
        assert.equal(items.length, 1);
        var logRecord = items[0];
        assert.equal(logRecord.levelName, 'warn');
        assert.equal(logRecord.msg, 'circuit became unhealthy');
        assert.equal(logRecord.meta.serviceName, 'bob');
        assert.equal(logRecord.meta.callerName, 'alice');

        assert.ok(declined > 70, 'should largely decline when unhealthy');
        assert.ok(unexpected > 20, 'should trickle original error');

        assert.end();
    }
});

RelayNetwork.test('switches to unhealthy on timeout', aliceAndBob, function t(network, assert) {

    network.register('call', function (req, res) {
        network.timers.advance(200);
    });

    network.exercise(100, 11, eachRequest, eachResponse, onCompletion);

    function eachRequest(callback) {
        network.send({
            callerName: 'alice',
            serviceName: 'bob',
        }, 'call', 'tiny head', 'HUGE BODY', callback);
    }

    var timedOut = 0;
    var declined = 0;

    function eachResponse(err, res) {
        if (err.codeName === 'Timeout') {
            timedOut++;
        } else if (err.codeName === 'Declined') {
            declined++;
        }
    }

    function onCompletion(err) {
        if (err) return assert.end(err);

        assert.deepEquals(network.getCircuitTuples(0), [
            ['alice', 'bob', 'call']
        ], 'only one circuit should be created');

        // TODO compare timedOut and declined
        var circuit = network.getCircuit(0, 'alice', 'bob', 'call');
        assert.equals(circuit.state.type, 'tchannel.unhealthy', 'should switch to unhealthy');

        assert.end();
    }
});

RelayNetwork.test('switches to unhealthy on service connection reset', aliceAndBob, function t(network, assert) {

    network.register('call', function (req, res) {
        network.serviceChannelsByName.bob[0].close();
    });

    network.exercise(100, 100, eachRequest, eachResponse, onCompletion);

    function eachRequest(callback) {
        network.send({
            callerName: 'alice',
            serviceName: 'bob'
        }, 'call', 'tiny head', 'HUGE BODY', callback);
    }

    var reset = 0;
    var declined = 0;

    function eachResponse(err, res) {
        if (err.codeName === 'NetworkError') {
            reset++;
        } else if (err.codeName === 'Declined') {
            declined++;
        }
    }

    function onCompletion(err) {
        if (err) return assert.end(err);

        assert.ok(declined > reset * 2, 'should typicaly decline');

        var circuit = network.getCircuit(0, 'alice', 'bob', 'call');
        assert.equals(circuit.state.type, 'tchannel.unhealthy', 'should switch to unhealthy');

        assert.end();
    }
});

// TODO uncomment this when
// a.) it is safe to issue a request to a destroyed channel (and get a connection error)
// b.) when connection errors flow through request/send
// RelayNetwork.test('switches to unhealthy on caller connection reset', aliceAndBob, function t(network, assert) {
//
//     network.register('call', function (req, res) {
//         network.serviceChannelsByName.alice[0].close();
//     });
//
//     network.exercise(100, 100, eachRequest, eachResponse, onCompletion);
//
//     function eachRequest(callback) {
//         network.send({
//             callerName: 'alice',
//             serviceName: 'bob'
//         }, 'call', 'tiny head', 'HUGE BODY', callback);
//     }
//
//     var reset = 0;
//     var declined = 0;
//
//     function eachResponse(err, res) {
//         if (err.codeName === 'NetworkError') {
//             reset++;
//         } else if (err.codeName === 'Declined') {
//             declined++;
//         }
//     }
//
//     function onCompletion(err) {
//         if (err) return assert.end(err);
//
//         assert.ok(declined > reset * 2, 'should typicaly decline');
//
//         var circuit = network.getCircuit(0, 'alice', 'bob', 'call');
//         assert.equals(circuit.state.type, 'tchannel.unhealthy', 'should switch to unhealthy');
//
//         assert.end();
//     }
// });

RelayNetwork.test('does not become unhealthy on cancel', aliceAndBob, function t(network, assert) {

    network.register('call', function (req, res) {
        res.sendError('Cancelled', 'no result for you');
    });

    network.exercise(100, 11, eachRequest, null, onCompletion);

    function eachRequest(callback) {
        network.send({
            callerName: 'alice',
            serviceName: 'bob'
        }, 'call', 'tiny head', 'HUGE BODY', callback);
    }

    function onCompletion(err) {
        if (err) return assert.end(err);

        var circuit = network.getCircuit(0, 'alice', 'bob', 'call');
        assert.equals(circuit.state.type, 'tchannel.healthy', 'still healthy');

        assert.end();
    }
});

RelayNetwork.test('does not become unhealthy on bad request', aliceAndBob, function t(network, assert) {

    network.register('call', function (req, res) {
        res.sendError('BadRequest', 'there are no dumb questions');
    });

    network.exercise(100, 11, eachRequest, null, onCompletion);

    function eachRequest(callback) {
        network.send({
            callerName: 'alice',
            serviceName: 'bob'
        }, 'call', 'tiny head', 'HUGE BODY', callback);
    }

    function onCompletion(err) {
        if (err) return assert.end(err);

        var circuit = network.getCircuit(0, 'alice', 'bob', 'echo');
        assert.equals(circuit.state.type, 'tchannel.healthy', 'still healthy');

        assert.end();
    }
});

RelayNetwork.test('circuit state machine behaves properly', aliceAndBob, function t(network, assert) {

    network.register('call', function (req, res) {
        network.serviceChannelsByName.bob[0].close();
    });

    network.exercise(100, 100, eachRequest, eachResponse, onCompletion);

    var state = initiallyHealthy;
    var count = 0;

    function eachRequest(callback) {
        network.send({
            callerName: 'alice',
            serviceName: 'bob'
        }, 'call', 'tiny head', 'HUGE BODY', callback);
    }

    function eachResponse(err) {
        state(err);
    }

    function initiallyHealthy(err, res) {
        assert.equals(err.type, 'tchannel.network', 'network errors initially');
        count++;
        if (count > 4) {
            count = 0;
            state = waitForUnhealthy;
        }
    }

    function waitForUnhealthy(err, res) {
        if (err.type === 'tchannel.declined') {
            state = whileUnhealthy;
        } else {
            assert.equals(err.type, 'tchannel.network', 'more initial network errors');
        }
    }

    function whileUnhealthy(err, res) {
        assert.equals(err.type, 'tchannel.declined', 'decline while unhealthy initially');
        count++;
        if (count > 2) {
            count = 0;
            state = waitForProbe;
        }
    }

    function waitForProbe(err, res) {
        if (err.type === 'tchannel.network') {
            state = whileUnhealthy;
        } else {
            assert.equals(err.type, 'tchannel.declined', 'decline while waiting for probe');
        }
    }

    function onCompletion(err) {
        if (err) return assert.end(err);

        var circuit = network.getCircuit(0, 'alice', 'bob', 'call');
        assert.equals(circuit.state.type, 'tchannel.unhealthy', 'became unhealthy');

        assert.end();
    }
});

RelayNetwork.test('recovers after five successes', aliceAndBob, function t(network, assert) {

    var healthy = false;

    network.register('call', function (req, res) {
        if (healthy) {
            res.headers.as = 'raw';
            res.sendOk('tiny head', 'HUGE BODY');
        } else {
            res.sendError('UnexpectedError', 'it wasn\'t me');
        }
    });

    network.exercise(100, 200, eachRequest, eachResponse, onCompletion);

    var state = waitForDecline;
    var count = 0;
    var probes = 0;

    function eachRequest(callback) {
        network.send({
            callerName: 'alice',
            serviceName: 'bob'
        }, 'call', 'tiny head', 'HUGE BODY', callback);
    }

    function eachResponse(err) {
        state(err);
    }

    function waitForDecline(err, res) {
        count++;
        if (err.type === 'tchannel.declined') {
            assert.ok(count > 2, 'should be some initial unexpected errors');
            count = 0;
            state = waitForProbe;
            healthy = true;
        } else {
            assert.equal(err.type, 'tchannel.unexpected', 'initially unexpected errors');
        }
    }

    function waitForProbe(err, res) {
        if (!err) {
            assert.equals(count, 2, 'should be a couple declines before a probe');
            count = 0;
            probes++;
            if (probes > 5) {
                probes = 0;
                state = healthyAgain;
            }
        } else if (err.type === 'tchannel.declined') {
            count++;
        } else {
            assert.fail('should either decline or succeed in healthy state');
        }
    }

    function healthyAgain(err, res) {
        assert.ifError(err, 'should be no more errors');
        count++;
        if (count > 5) {
            // Return to initial testing conditions
            count = 0;
            healthy = false;
            state = waitForDecline;
        }
    }

    function onCompletion(err) {
        if (err) return assert.end(err);

        assert.end();
    }
});

RelayNetwork.test('does not recover when successes are non-consecutive', aliceAndBob, function t(network, assert) {

    var count = 0;

    var circuit = network.getCircuit(0, 'alice', 'bob', 'call');

    network.register('call', function (req, res) {
        count++;
        if (count > 20 && count % 4 !== 0) {
            res.headers.as = 'raw';
            res.sendOk('tiny head', 'HUGE BODY');
        } else {
            res.sendError('UnexpectedError', 'it wasn\'t me');
        }
    });

    network.exercise(100, 200, eachRequest, null, onCompletion);

    function eachRequest(callback) {
        network.send({
            callerName: 'alice',
            serviceName: 'bob'
        }, 'call', 'tiny head', 'HUGE BODY', callback);
    }

    function onCompletion(err) {
        if (err) return assert.end(err);
        assert.equals(circuit.state.type, 'tchannel.unhealthy');
        assert.end();
    }
});

RelayNetwork.test('recovers when failure is periodic but infrequent', aliceAndBob, function t(network, assert) {

    var count = 0;

    var circuit = network.getCircuit(0, 'alice', 'bob', 'call');

    network.register('call', function (req, res) {
        count++;
        if (count > 20 && count % 8 !== 0) {
            res.headers.as = 'raw';
            res.sendOk('tiny head', 'HUGE BODY');
        } else {
            res.sendError('UnexpectedError', 'it wasn\'t me');
        }
    });

    network.exercise(100, 200, eachRequest, null, onCompletion);

    function eachRequest(callback) {
        network.send({
            callerName: 'alice',
            serviceName: 'bob'
        }, 'call', 'tiny head', 'HUGE BODY', callback);
    }

    function onCompletion(err) {
        if (err) return assert.end(err);
        assert.equals(circuit.state.type, 'tchannel.healthy');
        assert.end();
    }
});

function runInterferenceScenario(network, errorCaller, errorService, errorEndpoint, assert) {

    network.register('respond', function (req, res) {
        res.headers.as = 'raw';
        if (String(req.arg3) === 'kill me') {
            res.sendError('UnexpectedError', 'nuke it from orbit');
        } else {
            res.sendOk('hello', 'world');
        }
    });

    if (errorEndpoint !== 'respond') {
        network.register(errorEndpoint, function (req, res) {
            res.sendError('UnexpectedError', 'nuke it from orbit');
        });
    }

    var ready = CountedReadySignal(2);
    network.exercise(20, 20, eachOkRequest, eachOkResponse, ready.signal);
    network.exercise(20, 20, eachErrorRequest, eachErrorResponse, ready.signal);
    ready(onCompletion);

    function eachOkRequest(callback) {
        network.send({
            callerName: 'alice',
            serviceName: 'bob'
        }, 'respond', 'hello', 'world', callback);
    }

    function eachOkResponse(err) {
        assert.ifErr(err, 'ok request should always succeed');
    }

    function eachErrorRequest(callback) {
        network.send({
            callerName: errorCaller,
            serviceName: errorService,
        }, errorEndpoint, 'hello', 'kill me', callback);
    }

    function eachErrorResponse(err) {
        assert.ok(err, 'error request should always fail');
    }

    function onCompletion(err) {
        var okCircuit = network.getCircuit(0, 'alice', 'bob', 'respond');
        var errorCircuit = network.getCircuit(0, errorCaller, errorService, errorEndpoint);
        assert.equals(okCircuit.state.type, 'tchannel.healthy', 'ok circuit should be healthy');
        assert.equals(errorCircuit.state.type, 'tchannel.unhealthy', 'error circuit should be unhealthy');
        assert.end();
    }
}

RelayNetwork.test('unhealthy endpoint does not interfere', aliceBobCharlie, function t(network, assert) {
    runInterferenceScenario(network, 'alice', 'bob', 'error', assert);
});

RelayNetwork.test('unhealthy caller does not interfere', aliceBobCharlie, function t(network, assert) {
    runInterferenceScenario(network, 'charlie', 'bob', 'respond', assert);
});

RelayNetwork.test('unhealthy callee does not interfere', aliceBobCharlie, function t(network, assert) {
    runInterferenceScenario(network, 'alice', 'charlie', 'respond', assert);
});

RelayNetwork.test('unhealthy callee and callee do not interfere', aliceBobCharlie, function t(network, assert) {
    runInterferenceScenario(network, 'charlie', 'bob', 'respond', assert);
});
