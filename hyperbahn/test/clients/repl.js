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
