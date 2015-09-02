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

var v2 = require('../v2/index.js');
var allocCluster = require('./lib/alloc-cluster.js');

allocCluster.test('lazy call handling', 2, function t(cluster, assert) {
    var one = cluster.channels[0];
    var two = cluster.channels[1];

    var client = one.makeSubChannel({
        serviceName: 'bob'
    });

    // var server =
    two.makeSubChannel({
        serviceName: 'bob'
    });
    two.connectionEvent.on(onServerConnection);

    var clientPeer = client.peers.add(two.hostPort);
    clientPeer.waitForIdentified(onIdentified);

    function onServerConnection(conn) {
        conn.setLazyHandling(true);
        conn.handler.handleCallLazily = handleCallLazily;
    }

    function handleCallLazily(frame) {
        // this is conn.handler
        // jshint validthis:true

        var res = frame.bodyRW.lazy.readService(frame);
        if (res.err) {
            throw res.err;
        }
        assert.equal(res.value, 'bob', 'expected called service name');

        res = frame.bodyRW.lazy.readArg1(frame);
        if (res.err) {
            throw res.err;
        }
        assert.deepEqual(res.value, Buffer('such'), 'expected called arg1');

        this.sendCallBodies(frame.id, new v2.CallResponse(
            0,                       // flags
            0,                       // code
            v2.Tracing.emptyTracing, // tracing
            {                        // headers
                'as': 'troll'        //
            },                       //
            v2.Checksum.Types.None,  // checksum
            ['', 'yeah', 'lol']      // args
        ), null, null, null);

        return true;
    }

    function onIdentified(err) {
        if (err) {
            assert.end(err);
            return;
        }

        // console.log(clientPeer.);
        // console.log(Object.keys(two.serverConnections));

        // var serverPeer = two.peers.get(one.hostPort);
        // console.log(serverPeer.connections);

        client.request({
            serviceName: 'bob',
            hasNoParent: true,
            headers: {
                cn: 'bobClient',
                as: 'troll'
            }
        }).send('such', 'lols', '4u', onResponse);
    }

    function onResponse(err, res) {
        if (err) {
            assert.end(err);
            return;
        }

        assert.deepEqual(res.arg2, Buffer('yeah'), 'expected res arg2');
        assert.deepEqual(res.arg3, Buffer('lol'), 'expected res arg3');

        assert.end();
    }
});
