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
/*eslint no-console: 0*/

var assert = require('assert');
var console = require('console');
var setTimeout = require('timers').setTimeout;

var TChannel = require('../channel.js');

var counter = 2;
var server = new TChannel();
var client = new TChannel();

var serverChan = server.makeSubChannel({
    serviceName: 'server'
});

// normal response
serverChan.register('func1', function onReq(req, res, arg2, arg3) {
    console.log('func1 responding with a small delay', {
        arg2: arg2.toString(),
        arg3: arg3.toString()
    });
    setTimeout(function onTimeout() {
        res.headers.as = 'raw';
        res.sendOk('result', 'indeed it did');
    }, Math.random() * 1000);
});

// err response
serverChan.register('func2', function onReq2(req, res) {
    res.headers.as = 'raw';
    res.sendNotOk(null, 'it failed');
});

server.listen(4040, '127.0.0.1', function onListen() {
    var clientChan = client.makeSubChannel({
        serviceName: 'server',
        peers: [server.hostPort],
        requestDefaults: {
            hasNoParent: true,
            headers: {
                'as': 'raw',
                'cn': 'example-client'
            }
        }
    });

    clientChan.request({
        serviceName: 'server',
        timeout: 1500
    }).send('func1', 'arg 1', 'arg 2', function onResp(err, res, arg2, arg3) {
        if (err) {
            finish(err);
        } else {
            assert.equal(res.ok, true);
            console.log('normal res:', {
                arg2: arg2.toString(),
                arg3: arg3.toString()
            });
            finish();
        }
    });

    clientChan.request({
        serviceName: 'server'
    }).send('func2', 'arg 1', 'arg 2', function onResp(err, res, arg2, arg3) {
        if (err) {
            finish(err);
        } else {
            assert.equal(res.ok, false);
            console.log('err res: ', {
                ok: res.ok,
                message: String(arg3)
            });
            finish();
        }
    });
});

function finish(err) {
    if (err) {
        throw err;
    }

    if (--counter === 0) {
        server.close();
        client.close();
    }
}
