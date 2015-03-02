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

    assert.equal(one.getPeer(hostTwo), null, 'one has no peer two');
    assert.equal(two.getPeer(hostOne), null, 'two has no peer one');

    var idBar = barrier.keyed(2, function(idents, done) {
        assert.equal(idents.one.hostPort, hostTwo, 'one identified two');
        assert.equal(idents.two.hostPort, hostOne, 'two identified one');

        var peersOne = one.getPeers();
        var peersTwo = two.getPeers();

        assert.equal(peersOne.length, 1, 'one should have 1 peer');
        assert.equal(peersTwo.length, 1, 'two should have 1 peer');

        var outPeer = one.getPeer(hostTwo);
        if (outPeer) {
            assert.equal(outPeer.direction, 'out', 'outPeer is out');
            assert.equal(outPeer.remoteName, hostTwo, 'outgoing connection name filled in');
        }

        var inPeer = two.getPeer(hostOne);
        if (inPeer) {
            assert.equal(inPeer.direction, 'in', 'inPeer is in');
            assert.equal(inPeer.remoteName, hostOne, 'incoming connection name filled in');
        }

        done();
    }, assert.end);

    one.once('identified', idBar('one'));
    two.once('identified', idBar('two'));
    one.addPeer(hostTwo);
});
