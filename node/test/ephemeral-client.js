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

var TChannel = require('../channel.js');

module.exports = runTests;

if (require.main === module) {
    runTests(require('./lib/hyperbahn-cluster.js'));
}

function runTests(HyperbahnCluster) {
    HyperbahnCluster.test('ephemeral client works', {
        size: 5
    }, function t(cluster, assert) {
        var bob = cluster.remotes.bob;

        for (var i = 0; i < cluster.apps.length; i++) {
            var app = cluster.apps[i];
            app.clients.serviceProxy.block('*', bob.serviceName);
        }

        var client = TChannel({
            trace: false
        });
        var subClient = client.makeSubChannel({
            serviceName: 'test',
            requestDefaults: {
                hasNoParent: true,
                headers: {
                    as: 'raw',
                    cn: 'client'
                }
            },
            peers: [cluster.hostPortList[0]]
        });

        subClient.waitForIdentified({
            host: cluster.hostPortList[0]
        }, onIdentified);

        function onIdentified(err) {
            assert.ifError(err);

            subClient.request({
                serviceName: bob.serviceName
            }).send('echo', 'a', 'b', onResponse);
        }

        function onResponse(err, res, arg2, arg3) {
            assert.ok(err);
            assert.equal(err.type, 'tchannel.request.timeout');

            assert.equal(res, null);

            client.close();

            setTimeout(function later() {
                assert.end();
            }, 10);
        }
    });
}
