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

var allocCluster = require('../lib/test-cluster.js');

allocCluster.test('register and forwarding huge buffer', {
    size: 5
}, function t(cluster, assert) {
    var steve = cluster.remotes.steve;
    var bob = cluster.remotes.bob;

    cluster.checkExitPeers(assert, {
        serviceName: steve.serviceName,
        hostPort: steve.hostPort
    });

    var hugStr = '';
    for (var i = 0; i < 70000; i++) {
        hugStr += 'a';
    }

    bob.clientChannel.request({
        serviceName: steve.serviceName
    }).send('echo', null, JSON.stringify(hugStr), onForwarded);

    function onForwarded(err, res, arg2, arg3) {
        if (err) {
            assert.ifError(err);
            return assert.end();
        }

        var peers = steve.channel.peers.values();
        var conns = peers.map(function toConn(p) {
            return p.connections[0];
        }).filter(Boolean);
        var streamingReq = conns.map(function toReq(c) {
            return Object.keys(c.handler.streamingReq).length;
        }).reduce(function sum(a, b) {
            return a + b;
        }, 0);
        var streamingRes = conns.map(function toRes(c) {
            return Object.keys(c.handler.streamingRes).length;
        }).reduce(function sum(a, b) {
            return a + b;
        }, 0);

        assert.equal(streamingReq, 0, 'should not leak streamingReq');
        assert.equal(streamingRes, 0, 'should not leak streamingRes');

        assert.equal(String(arg3), '"' + hugStr + '"');

        assert.end();
    }
});
