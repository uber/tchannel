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
var Buffer = require('buffer').Buffer;
var NullLogtron = require('null-logtron');

var rawHandler = require('../tchannel-raw-handler.js');

var hostInfo = 'localhost:4000';

test('rawHandler result', function t(assert) {
    var options = {
        clients: {
            logger: NullLogtron()
        }
    };

    var h = rawHandler(successHandler, 'success', options);

    h({
        service: 'wat',
        arg1: 'wat',
        arg2: new Buffer('arg2'),
        arg3: new Buffer('arg3'),
        remoteAddr: hostInfo
    }, function mockBuildResponse() {
        return {
            sendOk: sendOk
        };
    });

    function successHandler(inc, opts, cb) {
        assert.deepEqual(inc, {
            service: 'wat',
            endpoint: 'wat',
            head: new Buffer('arg2'),
            body: new Buffer('arg3'),
            hostInfo: hostInfo
        });
        assert.equal(opts, options);

        cb(null, {
            head: new Buffer('res1'),
            body: new Buffer('res2')
        });
    }

    function sendOk(res1, res2) {
        assert.deepEqual(res1, new Buffer('res1'));
        assert.deepEqual(res2, new Buffer('res2'));

        assert.end();
    }
});

test('rawHandler error', function t(assert) {
    var options = {
        clients: {
            logger: NullLogtron()
        }
    };

    var h = rawHandler(successHandler, 'success', options);

    h({
        service: 'wat',
        arg1: 'wat',
        arg2: new Buffer('arg2'),
        arg3: new Buffer('arg3'),
        remoteAddr: hostInfo
    }, function mockBuildResponse() {
        return {
            sendNotOk: sendNotOk
        };
    });

    function successHandler(inc, opts, cb) {
        assert.deepEqual(inc, {
            service: 'wat',
            endpoint: 'wat',
            head: new Buffer('arg2'),
            body: new Buffer('arg3'),
            hostInfo: hostInfo
        });
        assert.equal(opts, options);

        cb(new Error('foo'));
    }

    function sendNotOk(res1, res2) {
        assert.equal(res1, null);
        assert.equal(res2, '{"message":"foo"}');

        assert.end();
    }
});
