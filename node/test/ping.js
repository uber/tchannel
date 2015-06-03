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

var allocCluster = require('./lib/alloc-cluster.js');

allocCluster.test('ping with a remote connection', 2, function t(cluster, assert) {
    var client = cluster.channels[0];
    var server = cluster.channels[1];
    var peer = client.peers.choosePeer(null, {host: server.hostPort});
    var conn = peer.connect();
    conn.pingResponseEvent.on(function onResponse(res) {
        assert.equals(res.id, conn.handler.lastSentFrameId,
            'validate ping response id');
        server.close();
        assert.end();
    });

    conn.ping();
});

allocCluster.test('ping with a self connection', 1, function t(cluster, assert) {
    var server = cluster.channels[0];
    var peer = server.peers.choosePeer(null, {host: server.hostPort});
    var conn = peer.connect();
    conn.pingResponseEvent.on(function onResponse(res) {
        assert.equals(res.id, conn.idCount - 1,
            'validate ping response id');
        server.close();
        assert.end();
    });

    conn.ping();
});
