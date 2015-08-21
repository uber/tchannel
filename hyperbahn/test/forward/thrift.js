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

var fs = require('fs');
var path = require('path');
var someSpec = fs.readFileSync(
    path.join(__dirname, 'someSpec.thrift'), 'utf8'
);

var allocCluster = require('../lib/test-cluster.js');

allocCluster.test('register and forward with thrift', {
    size: 5
}, function t(cluster, assert) {
    var TChannelAsThrift = cluster.dummies[0].TChannelAsThrift;

    var steve = cluster.remotes.steve;
    var bob = cluster.remotes.bob;
    var tchannelThrift = TChannelAsThrift({
        source: someSpec
    });

    cluster.checkExitPeers(assert, {
        serviceName: steve.serviceName,
        hostPort: steve.hostPort
    });

    tchannelThrift.register(
        steve.serverChannel, 'echo::thrift_echo', {}, echo
    );

    function echo(ctx, req, arg2, arg3, cb) {
        cb(null, {
            ok: true,
            body: arg3
        });
    }

    tchannelThrift.send(bob.clientChannel.request({
        serviceName: 'steve'
    }), 'echo::thrift_echo', null, {
        foo: {
            bar: 2,
            baz: 'hi'
        }
    }, onForwarded);

    function onForwarded(err, res) {
        assert.ifError(err);

        assert.deepEqual(res.body, {
            foo: {
                bar: 2,
                baz: 'hi'
            }
        });

        assert.end();
    }
});
