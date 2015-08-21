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

/* Given a 5 node cluster where k = 3.

    Find a key that hashes from En1 to eX1
    Kill eX1 then send En1.register()

    Expect to get two results back and one failure

*/

var allocCluster = require('../lib/test-cluster.js');

allocCluster.test('register when exit node is down', {
    size: 5,
    remoteConfig: {
        'kValue.default': 3
    }
}, function t(cluster, assert) {
    var entryNode = cluster.apps[0];
    var exitNode1 = cluster.apps[1];
    var steve = cluster.dummies[0];

    cluster.logger.whitelist(
        'warn',
        'Relay advertise failed with expected err'
    );

    var serviceName = entryNode.ring
        .hashToHostPort(exitNode1).service;

    exitNode1.destroy({
        force: true
    });

    cluster.sendRegister(steve, {
        serviceName: serviceName,
        host: entryNode.hostPort
    }, onRegistered);

    function onRegistered(err, result) {
        if (err) {
            assert.ifError(err);
            return assert.end();
        }

        cluster.checkExitPeers(assert, {
            serviceName: serviceName,
            hostPort: steve.hostPort,
            blackList: [exitNode1.hostPort]
        });

        assert.ok(result.body.connectionCount <= 3 &&
            result.body.connectionCount > 0);

        var errors = cluster.logger.items();
        assert.equal(errors.length, 1);
        assert.equal(errors[0].fields.msg,
            'Relay advertise failed with expected err');
        assert.equal(errors[0].fields.error.fullType,
            'tchannel.socket~!~' +
            'error.wrapped-io.connect.ECONNREFUSED');

        assert.end();
    }
});
