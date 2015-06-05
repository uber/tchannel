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

var TimeMock = require('time-mock');
var allocCluster = require('./lib/alloc-cluster.js');
var timers = TimeMock(Date.now());

allocCluster.test('requests will timeout', {
    numPeers: 2,
    channelOptions: {
        timers: timers
    }
}, function t(cluster, assert) {
    var one = cluster.channels[0];
    var two = cluster.channels[1];
    var sub = one.makeSubChannel({
        serviceName: 'server'
    });

    sub.register('/normal-proxy', normalProxy);
    sub.register('/timeout', timeout);

    var twoSub = two.makeSubChannel({
        serviceName: 'server',
        peers: [one.hostPort]
    });

    twoSub
        .request({
            serviceName: 'server',
            hasNoParent: true,
            headers: {
                'as': 'raw',
                cn: 'wat'
            },
            timeout: 1000
        })
        .send('/normal-proxy', 'h', 'b', onResp);

    function onResp(err, res, arg2, arg3) {
        assert.ifError(err);

        assert.equal(String(arg2), 'h');
        assert.equal(String(arg3), 'b');

        twoSub
            .request({
                serviceName: 'server',
                hasNoParent: true,
                headers: {
                    'as': 'raw',
                    cn: 'wat'
                },
                timeout: 1000
            })
            .send('/timeout', 'h', 'b', onTimeout);

        var twoConn = two.peers.get(one.hostPort).connections[0];

        var adv = Math.max(1001, (
            twoConn.options.timeoutCheckInterval +
            (twoConn.options.timeoutFuzz / 2) + 1
        ));

        // timers module has weird semantics
        // TODO: less magic
        var newTime = timers.now() + adv;
        timers.now = function now() {
            return newTime;
        };

        timers.advance(adv);
    }

    function onTimeout(err) {
        assert.equal(err && err.type, 'tchannel.request.timeout', 'expected timeout error');
        // one.peers.get(two.hostPort).connections[0].onTimeoutCheck();
        cluster.assertCleanState(assert, {
            channels: [{
                peers: [{
                    connections: [
                        {direction: 'in', inReqs: 0, outReqs: 0}
                    ]
                }]
            }, {
                peers: [{
                    connections: [
                        {direction: 'out', inReqs: 0, outReqs: 0}
                    ]
                }]
            }]
        });
        assert.end();
    }

    function normalProxy(req, res, arg2, arg3) {
        res.headers.as = 'raw';
        res.sendOk(arg2, arg3);
    }
    function timeout(/* head, body, hostInfo, cb */) {
        // do not call cb();
    }
});
