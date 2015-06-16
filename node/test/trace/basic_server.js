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

var allocCluster = require('../lib/alloc-cluster.js');
var CountedReadySignal = require('ready-signal/counted');
var DebugLogtron = require('debug-logtron');
var test = require('tape');

var TChannel = require('../../channel.js');
var fixture = require('./basic_server_fixture');
var validators = require('../lib/simple_validators');

allocCluster.test('basic tracing test', {
    numPeers: 3,
    channelOptions: {
        traceReporter: testTraceReporter(),
        trace: true
    },
    listen: [
        4040,
        4041,
        4042
    ]
}, function t(cluster, assert) {
    var logger = cluster.logger;
    var server = cluster.channels[0];
    var client = cluster.channels[1];
    var subservice = cluster.channels[2];
    var traceReporter = server.tracer.reporter;

    var subChan = subservice.makeSubChannel({
        serviceName: 'subservice'
    });
    subChan.register('/foobar', function (req, res) {
        logger.debug("subserv sr");
        res.headers.as = 'raw';
        res.sendOk('result', 'success');
    });

    var serverChan = server.makeSubChannel({
        serviceName: 'server'
    });
    serverChan.register('/top_level_endpoint', handleTopLevelEndpoint);

    var subServiceChan = server.makeSubChannel({
        serviceName: 'subservice'
    });
    var clientChan = client.makeSubChannel({
        serviceName: 'server',
    });

    clientChan.peers.add(server.hostPort);
    subServiceChan.peers.add(subservice.hostPort);
    withReadyPeers(client, clientPeersReady);

    function handleTopLevelEndpoint(req, res) {
        withReadyPeers(server, function send() {
            logger.debug("top level sending to subservice");
            var servReq = subServiceChan.request({
                serviceName: 'subservice',
                parent: req,
                headers: {
                    as: 'raw',
                    cn: 'wat'
                },
                trace: true
            });
            servReq.send('/foobar', 'arg1', 'arg2', function response(err, subRes) {
                logger.debug('top level recv from subservice');
                res.headers.as = 'raw';
                if (err) return res.sendOk('error', err);
                res.sendOk('result', 'success: ' + subRes);
            });
        });
    }

    function clientPeersReady() {
        logger.debug('client making req');
        var req = clientChan.request({
            serviceName: 'server',
            hasNoParent: true,
            trace: true,
            headers: {
                as: 'raw',
                cn: 'wat'
            }
        });
        req.send('/top_level_endpoint', "arg 1", "arg 2", function (err, res) {
            logger.debug("client recv from top level: " + res);
            testDone();
        });
    }

    function testDone() {
        // we clean up spans in their toJSON method for transport, so
        // do that and then validate them
        var cleanspans = traceReporter.spans.map(function (item) {
            return item.toJSON();
        });
        validators.validateSpans(assert, cleanspans, fixture);

        assert.end();
    }
});

function testTraceReporter() {
    function reporter(span) {
        reporter.spans.push(span);
    }
    reporter.spans = [];
    return reporter;
}

function withReadyPeers(chan, callback) {
    var peerList = chan.peers.values();
    var peersReady = new CountedReadySignal(peerList.length);
    peersReady(callback);
    peerList.forEach(function each(peer) {
        if (peer.isConnected()) {
            peersReady.signal();
        } else {
            peer.connect().on('identified', peersReady.signal);
        }
    });
}
