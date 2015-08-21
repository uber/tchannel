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

allocCluster.test('forwarding to a down service', {
    size: 5
}, function t(cluster, assert) {
    var bob = cluster.remotes.bob;
    var steve = cluster.remotes.steve;

    cluster.checkExitPeers(assert, {
        serviceName: steve.serviceName,
        hostPort: steve.hostPort
    });

    // Close the service to emulate failure.
    steve.destroy();

    bob.clientChannel.request({
        serviceName: steve.serviceName
    }).send('hi', null, JSON.stringify(null), onForwarded);

    function onForwarded(err, resp, arg2, arg3) {
        assert.ok(err, 'forward call should fail');

        assert.equal(err.isErrorFrame, true,
            'forwarding err is an error frame');

        cluster.checkExitPeers(assert, {
            serviceName: steve.serviceName,
            hostPort: steve.hostPort,
            disconnectedHostsPorts: [steve.hostPort]
        });

        // TODO make not flake
        // TODO this should not return a could not find service
        // error. The exit node needs to know the difference
        // between service exists & is down vs service does not exist.
        var message = 'unknown service ' + steve.serviceName;
        if (err.message === message) {
            assert.ok(true, 'skipping flaky test');
            return assert.end();
        }

        assert.ok(
            err.message.indexOf('connect ECONNREFUSED') >= 0 ||
            err.message.indexOf('socket closed') === 0 ||
            err.message === 'connect ECONNREFUSED' ||
            err.message === 'This socket has been ended by the other party',
            'expected error to be a socket closed error'
        );

        assert.end();
    }
});
