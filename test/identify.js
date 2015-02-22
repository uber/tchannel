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

var test = require('tape');

var allocCluster = require('./lib/alloc-cluster.js');
var barrier = require('./lib/barrier');

test('identify', function t(assert) {
    var cluster = allocCluster(2, {
        // logger: require('./logger')(process.stdout)
    });
    var one = cluster.channels[0];
    var two = cluster.channels[1];
    var hostOne = cluster.hosts[0];
    var hostTwo = cluster.hosts[1];

    assert.equal(one.getPeer(hostTwo), null, 'one has no peer two');
    assert.equal(two.getPeer(hostOne), null, 'two has no peer one');

    var idBar = barrier.keyed(2, function(idents, done) {
        var outPeer = one.getPeer(hostTwo);
        var inPeer = two.getPeer(hostOne);
        assert.equal(idents.one, hostTwo, 'one identified two');
        assert.equal(idents.two, hostOne, 'two identified one');
        assert.equal(outPeer.direction, 'out', 'outPeer is out');
        assert.equal(inPeer.direction, 'in', 'inPeer is in');
        assert.equal(outPeer && outPeer.remoteName, hostTwo, 'outgoing connection name filled in');
        assert.equal(inPeer && inPeer.remoteName, hostOne, 'incoming connection name filled in');
        done();
    }, finish);

    one.once('identified', idBar('one'));
    two.once('identified', idBar('two'));
    one.addPeer(hostTwo);

    function finish(err) {
        if (err) assert.fail(err);
        cluster.destroy(assert.end);
    }
});
