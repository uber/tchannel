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

/* jshint maxparams:5 */

'use strict';

var tape = require('tape');
var TChannel = require('../channel.js');
var Ping = require('../v2/ping.js');

tape('ping with a remote connection', function (assert) {

    var client = new TChannel();
    var server = new TChannel();

    server.listen(0, '127.0.0.1', function onListen() {

        var peer = client.peers.choosePeer(null, {host: server.hostPort});
        var conn = peer.connect();
        conn.pingResponseEvent.on(function onResponse(res) {
            assert.equals(res.type, Ping.Response.TypeCode,
                'validate ping response');
            server.close();
            assert.end();
        });

        conn.ping();
    });
});

tape('ping with a self connection', function (assert) {

    var server = new TChannel();

    server.listen(0, '127.0.0.1', function onListen() {

        var peer = server.peers.choosePeer(null, {host: server.hostPort});
        var conn = peer.connect();
        conn.pingResponseEvent.on(function onRequest(res) {
            assert.equals(res.type, Ping.Response.TypeCode,
                'validate ping response');
            server.close();
            assert.end();
        });

        conn.ping();
    });
});
