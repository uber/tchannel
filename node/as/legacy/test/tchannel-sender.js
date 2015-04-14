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

var test = require('tape');
var NullLogtron = require('null-logtron');

var jsonSender = require('../tchannel-json-sender.js');

test('sending stuff', function t(assert) {
    var tclient = jsonSender({
        logger: NullLogtron(),
        tchannel: {
            request: function request() {
                return {
                    send: send
                };

                function send() {
                    var cb = arguments[arguments.length - 1];
                    cb(null, {ok: true}, '"hi"', '"bye"');
                }
            }
        }
    });

    tclient.send({
        hostPort: 'host:port',
        service: 'wat',
        endpoint: 'foo',
        head: null,
        body: null,
        timeout: 5000
    }, function onResults(err, resp) {
        assert.ifError(err);

        assert.equal(resp.head, 'hi');
        assert.equal(resp.body, 'bye');

        assert.end();
    });
});

test('sending errors', function t(assert) {
    var tclient = jsonSender({
        logger: NullLogtron(),
        tchannel: {
            request: function request() {
                return {
                    send: send
                };

                function send() {
                    var cb = arguments[arguments.length - 1];

                    cb(new Error('oh hi'));
                }
            }
        }
    });

    tclient.send({
        hostPort: 'host:port',
        service: 'wat',
        endpoint: 'foo',
        head: null,
        body: null,
        timeout: 5000
    }, function onResults(err, resp) {
        assert.equal(err.message, 'oh hi');

        assert.end();
    });
});

test('sending tchannel error', function t(assert) {
    var tclient = jsonSender({
        logger: NullLogtron(),
        tchannel: {
            request: function request() {
                return {
                    send: send
                };

                function send() {
                    var cb = arguments[arguments.length - 1];
                    cb(null, {ok: false}, '', '{"message":"oh hi"}');
                }
            }
        }
    });

    tclient.send({
        hostPort: 'host:port',
        service: 'wat',
        endpoint: 'foo',
        head: null,
        body: null,
        timeout: 5000
    }, function onResults(err, resp) {
        assert.equal(err.message, 'oh hi');

        assert.end();
    });
});
