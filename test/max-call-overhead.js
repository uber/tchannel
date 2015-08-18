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

var allocCluster = require('./lib/alloc-cluster.js');

allocCluster.test('request() with large header key', {
    numPeers: 2
}, function t(cluster, assert) {
    cluster.logger.whitelist('info', 'resetting connection');

    var one = remoteService(cluster.channels[0]);
    var two = cluster.channels[1];

    var subTwo = two.makeSubChannel({
        serviceName: 'server'
    });

    subTwo.waitForIdentified({
        host: one.hostPort
    }, function onIdentified(err) {
        assert.ifError(err);

        subTwo.request({
            serviceName: 'server',
            hasNoParent: true,
            headers: {
                'as': 'raw',
                'cn': 'wat',
                'someReallyLargeHeaderKey': 'a'
            }
        }).send('echo', 'a', 'b', onResponse);
    });

    function onResponse(err, resp, arg2, arg3) {
        assert.ok(err);
        assert.equal(err.fullType,
            'tchannel.connection.reset~!~tchannel.protocol.write-failed~!~tchannel.transport-header-too-long'
        );
        assert.equal(err.message,
            'tchannel: tchannel write failure: transport header: someReallyLargeHeaderKey exceeds 16 bytes'
        );

        assert.equal(null, resp);

        assert.equal(cluster.logger.items().length, 1);
        var logLine = cluster.logger.items()[0];
        assert.equal(logLine.levelName, 'info');
        assert.equal(logLine.meta.error.type, 'tchannel.protocol.write-failed');


        assert.end();
    }
});

allocCluster.test('request() with large arg1', {
    numPeers: 2
}, function t(cluster, assert) {
    var one = remoteService(cluster.channels[0]);
    var two = cluster.channels[1];

    var subTwo = two.makeSubChannel({
        serviceName: 'server'
    });

    var arg1 = '';
    for (var i = 0; i < 16 * 1024 + 1; i++) {
        arg1 += 'a';
    }

    subTwo.waitForIdentified({
        host: one.hostPort
    }, function onIdentified(err) {
        assert.ifError(err);

        // TODO: O(pinions) -- is this really what we want?
        assert.throws(doRequest, /arg1 length \d+ is larger than the limit \d+/);

        assert.end();
    });

    function doRequest() {
        subTwo.request({
            serviceName: 'server',
            hasNoParent: true,
            headers: {
                'as': 'raw',
                'cn': 'wat'
            }
        }).send(arg1, 'a', 'b', onResponse);
    }

    function onResponse(err, resp, arg2, arg3) {
        assert.fail("shouldn't get a response callback");

        // assert.ok(err);
        // assert.equal(err.type, 'tchannel.arg1-over-length-limit');
        // assert.equal(err.message,
        //     'arg1 length 16385 is larger than the limit 16384'
        // );

        // assert.equal(null, resp);

        // assert.end();
    }
});

allocCluster.test('request() with too many headers', {
    numPeers: 2
}, function t(cluster, assert) {
    cluster.logger.whitelist('info', 'resetting connection');

    var one = remoteService(cluster.channels[0]);
    var two = cluster.channels[1];

    var subTwo = two.makeSubChannel({
        serviceName: 'server'
    });

    subTwo.waitForIdentified({
        host: one.hostPort
    }, function onIdentified(err) {
        assert.ifError(err);

        var headers = {
            'as': 'raw',
            'cn': 'wat'
        };
        for (var i = 0; i < 127; i++) {
            headers[i] = String(i);
        }

        subTwo.request({
            serviceName: 'server',
            hasNoParent: true,
            headers: headers
        }).send('echo', 'a', 'b', onResponse);
    });

    function onResponse(err, resp, arg2, arg3) {
        assert.ok(err);
        assert.equal(err.fullType, 
            'tchannel.connection.reset~!~tchannel.protocol.write-failed~!~tchannel.protocol.too-many-headers'
        );
        assert.equal(err.message,
            'tchannel: tchannel write failure: too many transport headers, got 130, expected at most 128'
        );

        assert.equal(null, resp);

        assert.equal(cluster.logger.items().length, 1);
        var logLine = cluster.logger.items()[0];
        assert.equal(logLine.levelName, 'info');
        assert.equal(logLine.meta.error.type, 'tchannel.protocol.write-failed');

        assert.end();
    }
});

function remoteService(chan) {
    chan.makeSubChannel({
        serviceName: 'server'
    }).register('echo', function echo(req, res, arg2, arg3) {
        res.headers.as = 'raw';
        res.sendOk(arg2, arg3);
    });

    return chan;
}
