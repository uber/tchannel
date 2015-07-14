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

'use strict';

var process = require('process');
process.title = 'nodejs-benchmarks-trace_server';

var Statsd = require('uber-statsd-client');
var Buffer = require('buffer').Buffer;

var TChannel = require('../channel');
var server = TChannel({
    statTags: {
        app: 'tcollector'
    },
    emitConnectionMetrics: false,
    trace: false,
    statsd: new Statsd({
        host: '127.0.0.1',
        port: 7036
    })
});

var tcollectorChan = server.makeSubChannel({
    serviceName: 'tcollector'
});

server.listen(7039, '127.0.0.1');

tcollectorChan.register('TCollector::submit', function onSubmit(req, res) {
    var arg2 = new Buffer([0x00, 0x00]);
    // 0c00 0002 0001 0100 00
    var arg3 = new Buffer([
        0x0c, 0x00, 0x00, 0x02,
        0x00, 0x01, 0x01, 0x00,
        0x00
    ]);

    res.headers.as = 'raw';
    res.sendOk(arg2, arg3);
});
