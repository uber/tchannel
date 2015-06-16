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

var CountedReadySignal = require('ready-signal/counted');
var DebugLogtron = require('debug-logtron');
var test = require('tape');

var TChannel = require('../../channel.js');

var logger = DebugLogtron('tchannel');

var validators = require('../lib/simple_validators');

test('ephemeral client tracing test', function (assert) {

    var spans = [];

    function traceReporter(span) {
        spans.push(span);
    }

    var subservice = new TChannel({
        logger: logger,
        traceReporter: traceReporter,
        trace: true
    });
    var subChan = subservice.makeSubChannel({
        serviceName: 'subservice'
    });

    var server = new TChannel({
        logger: logger,
        traceReporter: traceReporter,
        trace: true
    });
    var serverChan = server.makeSubChannel({
        serviceName: 'server'
    });
    var subServiceChan = server.makeSubChannel({
        serviceName: 'subservice',
        peers: ['127.0.0.1:4042']
    });

    var client = new TChannel({
        logger: logger,
        traceReporter: traceReporter,
        trace: true
    });
    var clientChan = client.makeSubChannel({
        serviceName: 'server',
        peers: ['127.0.0.1:4040']
    });
    clientChan.register('/back', function (req, res) {
        res.headers.as = 'raw';
        res.sendOk('back to', 'the future');
    });

    subChan.register('/foobar', function (req, res) {
        res.headers.as = 'raw';
        res.sendOk('result', 'success');
    });

    // normal response

    serverChan.register('/top_level_endpoint', function (req, res) {
        withReadyPeers(server, function send() {
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
                res.headers.as = 'raw';
                if (err) return res.sendOk('error', err);
                res.sendOk('result', 'success: ' + subRes);
            });
        });
    });

    var ready = CountedReadySignal(2);
    ready(onListening);
    server.listen(4040, '127.0.0.1', ready.signal);
    subservice.listen(4042, '127.0.0.1', ready.signal);

    function onListening(err) {
        if (err) {
            finish(err);
            return;
        }

        withReadyPeers(client, function send() {
            var requestsDone = CountedReadySignal(1);

            // var c2sreq = clientChan.request({
            //     serviceName: 'server',
            //     hasNoParent: true,
            //     trace: true,
            //     headers: {
            //         as: 'raw',
            //         cn: 'wat'
            //     }
            // });
            // c2sreq.send('/top_level_endpoint', "arg 1", "arg 2", function (err, res) {
            //     if (err) assert.fail(err);
            //     requestsDone.signal();
            // });

            serverChan.peers.add(server.peers.values()[1]);

            var s2creq = serverChan.request({
                serviceName: 'server',
                hasNoParent: true,
                trace: true,
                headers: {
                    as: 'raw',
                    cn: 'hah'
                }
            });
            s2creq.send('/back', "arg 1", "arg 2", function (err, res) {
                if (err) assert.fail(err);
                requestsDone.signal();
            });

            requestsDone(testDone);
        });
    }

    function testDone() {
        // we clean up spans in their toJSON method for transport, so
        // do that and then validate them
        console.log('spans:', spans);
        var cleanspans = spans.map(function (item) {
            return item.toJSON();
        });
        var idStore = {};
        validators.validateSpans(assert, cleanspans, [
            {
                "name": "/foobar",
                "endpoint": {
                    "ipv4": "127.0.0.1",
                    "port": 4042,
                    "serviceName": "subservice"
                },
                "traceid": validators.checkId(idStore, 'traceid'),
                "parentid": validators.checkId(idStore, 'span0'),
                "spanid": validators.checkId(idStore, 'span1'),
                "annotations": [
                    {
                        "value": "sr",
                        "timestamp": validators.timestamp,
                        "host": {
                            "ipv4": "127.0.0.1",
                            "port": 4042,
                            "serviceName": "subservice"
                        }
                    },
                    {
                        "value": "ss",
                        "timestamp": validators.timestamp,
                        "host": {
                            "ipv4": "127.0.0.1",
                            "port": 4042,
                            "serviceName": "subservice"
                        }
                    }
                ],
                "binaryAnnotations": []
            }
        ]);
        finish();
    }

    function finish(err) {
        if (err) assert.fail(err);
        var closed = CountedReadySignal(3);
        closed(assert.end);
        client.close(closed.signal);
        server.close(closed.signal);
        subservice.close(closed.signal);
    }
});

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
