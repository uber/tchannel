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

allocCluster.test('register fails for empty serviceName', {
    size: 2
}, function t(cluster, assert) {
    cluster.tchannelJSON.send(cluster.dummies[0].makeSubChannel({
        serviceName: 'hyperbahn',
        peers: cluster.hostPortList
    }).request({
        serviceName: 'hyperbahn',
        hasNoParent: true,
        timeout: 5000,
        headers: {
            'cn': ';)'
        }
    }), 'ad', null, {
        services: [{
            cost: 0,
            serviceName: ''
        }]
    }, onResponse);

    function onResponse(err, resp) {
        assert.ifError(err);

        assert.equal(resp.ok, true);
        assert.equal(resp.body.connectionCount, 0);

        assert.end();
    }
});
