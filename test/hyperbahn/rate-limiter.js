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
var DebugLogtron = require('debug-logtron');
var TChannelJSON = require('../../as/json');
var HyperbahnClient = require('../../hyperbahn/index.js');
var series = require('run-series');

module.exports = runTests;

if (require.main === module) {
    runTests(require('../lib/hyperbahn-cluster.js'));
}

function send(opts, done) {
    var tchannelJSON = TChannelJSON({
        logger: opts.logger
    });
    tchannelJSON.send(opts.bob.clientChannel.request({
        timeout: 500,
        serviceName: opts.steve.serviceName
    }), 'echo', null, 'hello', function onResponse(err, res) {
        if (opts.errOk) {
            err = null;
        }

        if (err) {
            opts.assert.end(err);
        }

        done(err, res);
    });
}

function waitFor(t) {
    return function wait(done) {
        setTimeout(done, 500);
    };
}

function runTests(HyperbahnCluster) {
    HyperbahnCluster.test('rps counter works', {
        size: 1,
        remoteConfig: {
            'rateLimiting.enabled': true,
            'rateLimiting.rateLimiterBuckets': 2,
            'rateLimiting.exemptServices': [
                'hyperbahn',
                'ringpop'
            ]
        }
    }, function t(cluster, assert) {
        var steve = cluster.remotes.steve;
        var bob = cluster.remotes.bob;

        var steveHyperbahnClient = new HyperbahnClient({
            reportTracing: false,
            serviceName: steve.serviceName,
            callerName: 'forward-test',
            hostPortList: cluster.hostPortList,
            tchannel: steve.channel,
            logger: DebugLogtron('hyperbahnClient')
        });
        steveHyperbahnClient.once('advertised', onAdvertised);
        steveHyperbahnClient.advertise();
        function onAdvertised() {
            var opts = {
                logger: cluster.logger,
                bob: bob,
                steve: steve,
                assert: assert
            };
            series([
                send.bind(null, opts),
                send.bind(null, opts),
                send.bind(null, opts),
                function check(done) {
                    cluster.apps.forEach(function (app) {
                        var relayChannel = app.clients.tchannel;
                        assert.equals(relayChannel.handler.rateLimiter.totalRequestCounter.rps, 3, 'total request');
                        assert.equals(relayChannel.handler.rateLimiter.serviceCounters.steve.rps, 3, 'request for steve');
                        assert.equals(relayChannel.handler.rateLimiter.edgeCounters['bob~~steve'].rps, 3, 'request for bob~~steve');
                    });
                    done();
                }
            ], function done() {
                steveHyperbahnClient.destroy();
                assert.end();
            });
        }
    });

    HyperbahnCluster.test('rps counter works in 1.5 seconds', {
        size: 1,
        remoteConfig: {
            'rateLimiting.enabled': true,
            'rateLimiting.rateLimiterBuckets': 2,
            'rateLimiting.exemptServices': [
                'hyperbahn',
                'ringpop'
            ]
        }
    }, function t(cluster, assert) {
        var steve = cluster.remotes.steve;
        var bob = cluster.remotes.bob;

        var steveHyperbahnClient = new HyperbahnClient({
            reportTracing: false,
            serviceName: steve.serviceName,
            callerName: 'forward-test',
            hostPortList: cluster.hostPortList,
            tchannel: steve.channel,
            logger: DebugLogtron('hyperbahnClient')
        });
        steveHyperbahnClient.once('advertised', onAdvertised);
        steveHyperbahnClient.advertise();

        function onAdvertised() {
            var opts = {
                logger: cluster.logger,
                bob: bob,
                steve: steve,
                assert: assert
            };
            series([
                send.bind(null, opts),
                send.bind(null, opts),
                waitFor(500),
                send.bind(null, opts),
                function check1(done) {
                    cluster.apps.forEach(function (app) {
                        var relayChannel = app.clients.tchannel;
                        var rateLimiter = relayChannel.handler.rateLimiter;
                        assert.equals(rateLimiter.totalRequestCounter.rps, 3, 'check1: total request');
                        assert.equals(rateLimiter.serviceCounters.steve.rps, 3, 'check1: request for steve');
                        assert.equals(relayChannel.handler.rateLimiter.edgeCounters['bob~~steve'].rps, 3, 'check1: request for bob~~steve');
                    });
                    done();
                },

                waitFor(500),
                send.bind(null, opts),
                function check2(done) {
                    cluster.apps.forEach(function (app) {
                        var relayChannel = app.clients.tchannel;
                        var rateLimiter = relayChannel.handler.rateLimiter;
                        assert.equals(rateLimiter.totalRequestCounter.rps, 2, 'check2: total request');
                        assert.equals(rateLimiter.serviceCounters.steve.rps, 2, 'check2: request for steve');
                        assert.equals(relayChannel.handler.rateLimiter.edgeCounters['bob~~steve'].rps, 2, 'check2: request for bob~~steve');
                    });
                    done();
                }
            ], function done() {
                steveHyperbahnClient.destroy();
                assert.end();
            });
        }
    });

    HyperbahnCluster.test('service rate limiting works', {
        size: 1,
        kValue: 2,
        remoteConfig: {
            'rateLimiting.enabled': true,
            'rateLimiting.rateLimiterBuckets': 2,
            'rateLimiting.exemptServices': [
                'hyperbahn',
                'ringpop'
            ],
            'rateLimiting.rpsLimitForServiceName': {
                'steve': 2
            }
        }
    }, function t(cluster, assert) {
        var steve = cluster.remotes.steve;
        var bob = cluster.remotes.bob;

        var steveHyperbahnClient = new HyperbahnClient({
            reportTracing: false,
            serviceName: steve.serviceName,
            callerName: 'forward-test',
            hostPortList: cluster.hostPortList,
            tchannel: steve.channel,
            logger: DebugLogtron('hyperbahnClient')
        });
        steveHyperbahnClient.once('advertised', onAdvertised);
        steveHyperbahnClient.advertise();

        function onAdvertised() {
            var opts = {
                logger: cluster.logger,
                bob: bob,
                steve: steve,
                assert: assert
            };
            series([
                send.bind(null, opts),
                send.bind(null, opts),
                send.bind(null, opts),
                function sendError(done) {
                    var tchannelJSON = TChannelJSON({
                        logger: cluster.logger
                    });
                    tchannelJSON.send(bob.clientChannel.request({
                        timeout: 5000,
                        serviceName: steve.serviceName
                    }), 'echo', null, 'hello', function onResponse(err, res) {
                        assert.ok(err && err.type === 'tchannel.busy' &&
                            err.message === 'steve is rate-limited by the rps of 2',
                            'should be rate limited');
                        done();
                    });
                }
            ], function done() {
                steveHyperbahnClient.destroy();
                assert.end();
            });
        }
    });

    HyperbahnCluster.test('total rate limiting works', {
        size: 5,
        kValue: 1,
        remoteConfig: {
            'rateLimiting.enabled': true,
            'rateLimiting.rateLimiterBuckets': 2,
            'rateLimiting.totalRpsLimit': 2,
            'rateLimiting.exemptServices': [
                'hyperbahn',
                'ringpop'
            ]
        }
    }, function t(cluster, assert) {
        var steve = cluster.remotes.steve;
        var bob = cluster.remotes.bob;

        var steveHyperbahnClient = new HyperbahnClient({
            reportTracing: false,
            serviceName: steve.serviceName,
            callerName: 'forward-test',
            hostPortList: cluster.hostPortList,
            tchannel: steve.channel,
            logger: DebugLogtron('hyperbahnClient')
        });
        steveHyperbahnClient.once('advertised', onAdvertised);
        steveHyperbahnClient.advertise();

        function onAdvertised() {
            var opts = {
                logger: cluster.logger,
                bob: bob,
                steve: steve,
                assert: assert
            };
            series([
                send.bind(null, opts),
                send.bind(null, opts),
                waitFor(500),
                send.bind(null, opts),
                function sendError(done) {
                    var tchannelJSON = TChannelJSON({
                        logger: cluster.logger
                    });
                    tchannelJSON.send(bob.clientChannel.request({
                        timeout: 5000,
                        serviceName: steve.serviceName
                    }), 'echo', null, 'hello', function onResponse(err, res) {
                        assert.ok(err && err.type === 'tchannel.busy' &&
                            err.message === 'hyperbahn node is rate-limited by the total rps of 2',
                            'should be rate limited');
                        done();
                    });
                }
            ], function done() {
                steveHyperbahnClient.destroy();
                assert.end();
            });
        }
    });

    HyperbahnCluster.test('service exempt works', {
        size: 1,
        kValue: 1,
        remoteConfig: {
            'rateLimiting.enabled': true,
            'rateLimiting.rateLimiterBuckets': 2,
            'rateLimiting.totalRpsLimit': 2,
            'rateLimiting.exemptServices': [
                'hyperbahn',
                'ringpop',
                'bob'
            ]
        }
    }, function t(cluster, assert) {
        var steve = cluster.remotes.steve;
        var bob = cluster.remotes.bob;

        var steveHyperbahnClient = new HyperbahnClient({
            reportTracing: false,
            serviceName: steve.serviceName,
            callerName: 'forward-test',
            hostPortList: cluster.hostPortList,
            tchannel: steve.channel,
            logger: DebugLogtron('hyperbahnClient')
        });
        steveHyperbahnClient.once('advertised', onAdvertised);
        steveHyperbahnClient.advertise();

        function onAdvertised() {
            var opts = {
                logger: cluster.logger,
                bob: bob,
                steve: steve,
                assert: assert
            };
            var opts2 = {
                logger: cluster.logger,
                bob: bob,
                steve: steve,
                assert: assert,
                errOk: true
            };
            series([
                send.bind(null, opts),
                send.bind(null, opts),
                send.bind(null, opts2),
                function sendLast(done) {
                    var tchannelJSON = TChannelJSON({
                        logger: cluster.logger
                    });
                    tchannelJSON.send(steve.clientChannel.request({
                        timeout: 5000,
                        serviceName: bob.serviceName
                    }), 'echo', null, 'hello', function onResponse(err, res) {
                        assert.ok(!err, 'should be no error');
                        assert.equals(res.body, 'hello', 'body should be "hello"');
                        done();
                    });
                }
            ], function done() {
                steveHyperbahnClient.destroy();
                assert.end();
            });
        }
    });
}
