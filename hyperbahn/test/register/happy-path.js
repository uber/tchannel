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

allocCluster.test('can register', {
    size: 5,
    dummies: 1
}, function t(cluster, assert) {
    var dummy = cluster.dummies[0];

    cluster.sendRegister(dummy, {
        serviceName: 'hello-bob'
    }, onResponse);

    function onResponse(err, result) {
        assert.ifError(err, 'register does not error');

        cluster.checkExitPeers(assert, {
            serviceName: 'hello-bob',
            hostPort: dummy.hostPort
        });

        assert.equal(result.head, null, 'head from register is null');
        var registerResult = result.body;

        assert.ok(registerResult.connectionCount <= 5 &&
            registerResult.connectionCount >= 1,
            'expected to have at most 5 register connections');

        assert.end();
    }
});
