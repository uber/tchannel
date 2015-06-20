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

var console = require('console');
var assert = require('assert');

var TChannel = require('../channel.js');

var server = new TChannel();
var client = new TChannel();

// bidirectional messages
server.makeSubChannel({
    serviceName: 'server'
}).register('ping', function onPing(req, res) {
    console.log('server got ping req from', {
        remoteAddr: req.remoteAddr
    });
    res.headers.as = 'raw';
    res.sendOk('pong', null);
});
client.makeSubChannel({
    serviceName: 'client'
}).register('ping', function onPing(req, res) {
    console.log('client got ping req from', {
        remoteAddr: req.remoteAddr
    });
    res.headers.as = 'raw';
    res.sendOk('pong', null);
});

server.listen(4040, '127.0.0.1', function onServerListen() {
    client.listen(4041, '127.0.0.1', onListen);
});

function onListen() {
    var clientOutChan = client.makeSubChannel({
        serviceName: 'server',
        peers: [server.hostPort],
        requestDefaults: {
            headers: {
                'as': 'raw',
                'cn': 'example-client'
            }
        }
    });
    var serverOutChan = server.makeSubChannel({
        serviceName: 'client',
        peers: [client.hostPort],
        requestDefaults: {
            headers: {
                'as': 'raw',
                'cn': 'example-server'
            }
        }
    });

    clientOutChan.request({
        serviceName: 'server',
        hasNoParent: true
    }).send('ping', null, null, onClientResponse);

    function onClientResponse(err, res, arg2, arg3) {
        if (err) {
            return finish(err);
        }

        assert.equal(res.ok, true);
        console.log('ping res from server', {
            arg2: arg2.toString(),
            arg3: arg3.toString()
        });

        serverOutChan.request({
            serviceName: 'client',
            hasNoParent: true
        }).send('ping', null, null, onServerResponse);
    }

    function onServerResponse(err, res, arg2, arg3) {
        if (err) {
            return finish(err);
        }

        assert.equal(res.ok, true);
        console.log('ping res from client', {
            arg2: arg2.toString(),
            arg3: arg3.toString()
        });

        finish();
    }
}

function finish(err) {
    if (err) {
        throw err;
    }

    server.close();
    client.close();
}
