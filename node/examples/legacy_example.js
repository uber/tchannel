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

var console = require('console');
var CountedReadySignal = require('ready-signal/counted');

var TChannel = require('../channel.js');

var ready = CountedReadySignal(2);
var server = new TChannel({
    serviceName: 'server'
});
server.listen(4040, '127.0.0.1', ready.signal);
var client = new TChannel();
client.listen(4041, '127.0.0.1', ready.signal);

// normal response
server.register('func 1', function func1(req, res, arg2, arg3) {
    console.log('func 1 responding immediately 1:' +
        arg2.toString() + ' 2:' + arg3.toString());
    res.sendOk('result', 'indeed it did');
});

// err response
server.register('func 2', function func2(req, res, arg2, arg3) {
    res.sendNotOk(null, 'it failed');
});

ready(function onReady() {
    client.send({
        host: '127.0.0.1:4040'
    }, 'func 1', 'arg 1', 'arg 2', function onResp1(err, res, res1, res2) {
        if (err) {
            console.log('unexpected err: ' + err.message);
        } else {
            console.log('normal res: ' + res1.toString() + ' ' + res2.toString());
        }
    });

    client.send({
        host: '127.0.0.1:4040'
    }, 'func 2', 'arg 1', 'arg 2', function onResp2(err, res, res1, res2) {
        console.log('ok: ' + res.ok + ' err res: ' + res2.toString());
    });
});
