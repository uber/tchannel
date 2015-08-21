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

allocCluster.test('set kill switch and forward', {
    size: 1
}, function t(cluster, assert) {
    var steve = cluster.remotes.steve;
    var bob = cluster.remotes.bob;
    var app = cluster.apps[0];

    app.client.sendKillSwitch({
        type: 'block',
        cn: '*',
        serviceName: 'steve'
    }, onSetKillSwitch);

    function onSetKillSwitch(err, res) {
        if (err) {
            return assert.end(err);
        }

        assert.ok(res.body.blockingTable['*~~steve'], 'should set the blocking service');
        cluster.sendRegister(steve.channel, {
            serviceName: steve.serviceName
        }, onRegistered);
    }

    function onRegistered(err, resp) {
        if (err) {
            return assert.end(err);
        }

        var body = resp.body;
        assert.ok(body, 'got a body from register');

        bob.clientChannel.request({
            serviceName: 'steve',
            timeout: 10
        }).send('echo', null, JSON.stringify('oh hi lol'), onForwarded);
    }

    function onForwarded(err, res, arg2, arg3) {
        assert.ok(err, 'should fail');
        assert.equals(err.type, 'tchannel.request.timeout', 'error type should be timeout');
        assert.end();
    }
});
