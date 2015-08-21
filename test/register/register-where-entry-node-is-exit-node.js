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

/*

This test handles the edge case where we send a register
message to an Entry node that is ALSO our Exit node.

*/

var allocCluster = require('../lib/test-cluster.js');

allocCluster.test('register with exit node', {
    size: 5
}, function t(cluster, assert) {
    var entryNode = cluster.apps[0];
    var steve = cluster.dummies[0];

    var serviceName = entryNode.ring.hashToHostPort(entryNode).service;

    cluster.sendRegister(steve, {
        serviceName: serviceName
    }, onRegister);

    function onRegister(err, resp) {
        assert.ifError(err);

        cluster.checkExitPeers(assert, {
            serviceName: serviceName,
            hostPort: steve.hostPort
        });

        var body = resp.body;

        assert.ok(body.connectionCount > 0 &&
            body.connectionCount <= 5);

        assert.end();
    }
});
