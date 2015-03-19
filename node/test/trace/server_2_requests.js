
// Copyright (c) 2015 Uber Technologies, Inc.

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

var TChannel = require('../../index.js');
var EndpointHandler = require('../../endpoint-handler.js');

var logger = DebugLogtron('example');

var fixture = require('./server_2_requests_fixture');
var validators = require('../lib/simple-validators');

test('basic tracing test', function (assert) {

    var spans = [];

    var subservice = new TChannel({
        handler: EndpointHandler(),
        logger: logger,
        traceReporter: function (span) {
            spans.push(span);
            console.log(span.toString());
        }
    });

    var server = new TChannel({
        handler: EndpointHandler(),
        logger: logger,
        traceReporter: function (span) {
            spans.push(span);
            console.log(span.toString());
        }
    });

    var client = new TChannel({
        logger: logger,
        traceReporter: function (span) {
            spans.push(span);
            console.log(span.toString());
        }
    });

    subservice.handler.register('subservice', function (req, res) {
        console.log("subserv sr");
        res.sendOk('result', 'success');
    });

    subservice.handler.register('subservice2', function (req, res) {
        console.log("subserv 2 sr");
        res.sendOk('result', 'success');
    });

    // normal response
    server.handler.register('/top_level_endpoint', function (req, res) {
        console.log("top level sending to subservice");
        var serverRequestsDone = CountedReadySignal(2);

        setTimeout(function () {
            server
                .request({host: '127.0.0.1:4042'})
                .send('subservice', 'arg1', 'arg2', function (err, subRes) {
                    console.log("top level recv from subservice");
                    if (err) return res.sendOk('error', err);

                    serverRequestsDone.signal();
                });
        }, 40);

        process.nextTick(function () {
            server
                .request({host: '127.0.0.1:4042'})
                .send('subservice2', 'arg1', 'arg2', function (err, subRes) {
                    console.log("top level recv from subservice");
                    if (err) return res.sendOk('error', err);

                    serverRequestsDone.signal();
                });
        });

        serverRequestsDone(function () {
            res.sendOk('result', 'success');
        });

    });

    var ready = CountedReadySignal(3);
    var requestsDone = CountedReadySignal(1);

    ready(function (err) {
        if (err) {
            throw err;
        }

        console.log("client making req");
        client
            .request({host: '127.0.0.1:4040'})
            .send('/top_level_endpoint', "arg 1", "arg 2", function (err, res) {
                console.log("client recv from top level");
                requestsDone.signal();
            });

    });

    server.listen(4040, '127.0.0.1', ready.signal);
    client.listen(4041, '127.0.0.1', ready.signal);
    subservice.listen(4042, '127.0.0.1', ready.signal);

    requestsDone(function () {
        setTimeout(function () {
            var cleanspans = spans.map(function (item) {
                return item.toJSON();
            });

            validators.validateSpans(assert, cleanspans, fixture);

            assert.end();
            client.close();
            server.close();
            subservice.close();
        }, 10);
    });
});
