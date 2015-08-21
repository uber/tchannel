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

var net = require('net');

var allocCluster = require('../lib/test-cluster.js');

allocCluster.test('can verify the repl', {
    size: 1
}, function t(cluster, assert) {
    var node = cluster.apps[0];

    var repl = node.clients.repl;
    var addr = repl.socketServer.address();

    var socket = net.connect(addr.port, 'localhost');
    socket.write('app().tchannel.hostPort\n');
    socket.end();

    var lines = [];

    socket.on('data', function onData(buf) {
        lines.push(String(buf));
    });

    socket.on('end', function onEnd() {
        var content = lines.join('\n');

        assert.ok(content.length > 0,
            'repl socket returns nothing');
        assert.notEqual(content.indexOf(node.hostPort), -1,
            'repl did not return the hostPort');

        assert.end();
    });
});
