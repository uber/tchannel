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

var PermissionsCache = require('../hyperbahn/permissions_cache.js');
var allocCluster = require('./lib/alloc-cluster.js');

allocCluster.test('permissionsCache: counts service request counts', {
    numPeers: 2
}, function t(cluster, assert) {
    var server = cluster.channels[0];
    var client = cluster.channels[1];

    var cache = new PermissionsCache({
        channel: server,
        logger: null
    });

    server.makeSubChannel({
        serviceName: 'server'
    }).register('echo', function echo(req, res, h, b) {
        res.headers.as = 'raw';
        res.sendOk(h, b);
    });

    var clientChan = client.makeSubChannel({
        serviceName: 'server',
        peers: [server.hostPort]
    });

    clientChan.request({
        serviceName: 'server',
        hasNoParent: true,
        headers: {
            cn: 'client',
            as: 'raw'
        }
    }).send('echo', 'a', 'b', onResponse);
    
    function onResponse(err, res, arg2, arg3) {
        if (err) {
            return assert.end(err);
        }

        server.flushStats();

        assert.ok(cache.lru.keys().indexOf('client_server') >= 0);
        assert.end();
        cache.clearBuckets();
    }
});
