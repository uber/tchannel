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

allocCluster.test('set k and forward', {
    size: 10,
    kValue: 5
}, function t(cluster, assert) {
    var steve = cluster.remotes.steve;
    var bob = cluster.remotes.bob;
    var app = cluster.apps[0];

    cluster.checkExitKValue(assert, {
        serviceName: steve.serviceName,
        kValue: 5
    });

    app.client.sendSetK({
        serviceName: steve.serviceName,
        k: 15
    }, onSetK);

    function onSetK(err) {
        if (err) {
            return assert.end(err);
        }

        cluster.checkExitKValue(assert, {
            serviceName: steve.serviceName,
            kValue: 15
        });

        cluster.sendRegister(steve.channel, {
            serviceName: steve.serviceName
        }, onRegistered);
    }

    function onRegistered(err, resp) {
        if (err) {
            return assert.end(err);
        }

        cluster.checkExitPeers(assert, {
            serviceName: steve.serviceName,
            hostPort: steve.hostPort
        });

        var body = resp.body;
        assert.ok(body, 'got a body from register');

        var exitNodes = app.hostsFor('steve');
        assert.equal(body.connectionCount, exitNodes.length,
            'got expected number of addresses and response');

        bob.clientChannel.request({
            serviceName: 'steve'
        }).send('echo', null, JSON.stringify('oh hi lol'), onForwarded);
    }

    function onForwarded(err, res, arg2, arg3) {
        if (err) {
            return assert.end(err);
        }

        assert.equal(String(arg3), '"oh hi lol"',
            'forwarding body is correct');

        assert.end();
    }
});

allocCluster.test('k value get set correctly', {
    size: 10,
    kValue: 11,
    remoteConfig: {
        'kValue.services': {
            'bob': 6,
            'steve': 7
        }
    }
}, function t(cluster, assert) {
    cluster.checkExitKValue(assert, {
        serviceName: 'nancy',
        kValue: 11
    });

    cluster.checkExitKValue(assert, {
        serviceName: 'bob',
        kValue: 6
    });

    cluster.checkExitKValue(assert, {
        serviceName: 'steve',
        kValue: 7
    });

    assert.end();
});
