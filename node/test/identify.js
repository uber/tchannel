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
var barrier = require('./lib/barrier');

allocCluster.test('identify', 2, function t(cluster, assert) {
    var one = cluster.channels[0];
    var two = cluster.channels[1];
    var hostOne = cluster.hosts[0];
    var hostTwo = cluster.hosts[1];

    assert.equal(one.peers.get(hostTwo), null, 'one has no peer two');
    assert.equal(two.peers.get(hostOne), null, 'two has no peer one');

    var idBar = barrier.keyed(2, function(idents, done) {
        assert.equal(idents.one.hostPort, hostTwo, 'one identified two');
        assert.equal(idents.two.hostPort, hostOne, 'two identified one');

        cluster.assertEmptyState(assert);

        done();
    }, assert.end);

    two.on('connection', function onConn(conn) {
        conn.on('identified', idBar('two'));
    });

    var one2two = one.peers.add(hostTwo);
    one2two.connect().on('identified', idBar('one'));

});
