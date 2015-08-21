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

allocCluster.test('register to a running server', {
    size: 2
}, function t(cluster, assert) {
    var server = cluster.dummies[0];

    cluster.sendRegister(server, {
        serviceName: 'hello-bob'
    }, onResponse);

    function onResponse(err, result) {
        assert.ifError(err, 'register does not error');

        cluster.checkExitPeers(assert, {
            serviceName: 'hello-bob',
            hostPort: server.hostPort
        });

        var body = result.body;
        assert.equal(typeof body.connectionCount, 'number');

        server.close();
        assert.end();
    }
});

allocCluster.test('double register to same hostPort', {
    size: 2
}, function t(cluster, assert) {
    var server = cluster.dummies[0];

    cluster.sendRegister(server, {
        serviceName: 'hello-bob'
    }, onResponse);

    function onResponse(err, result) {
        assert.ifError(err, 'register does not error');

        cluster.checkExitPeers(assert, {
            serviceName: 'hello-bob',
            hostPort: server.hostPort
        });

        cluster.sendRegister(server, {
            serviceName: 'hello-bob'
        }, onResponse2);
    }

    function onResponse2(err, result) {
        assert.ifError(err);

        cluster.checkExitPeers(assert, {
            serviceName: 'hello-bob',
            hostPort: server.hostPort
        });

        var body = result.body;

        assert.equal(typeof body.connectionCount, 'number');

        server.close();
        assert.end();
    }
});
