'use strict';

var test = require('tape');
var dgram = require('dgram');
var os = require('os');
var setTimeout = require('timers').setTimeout;

var createStatsd = require('../../clients/statsd.js');

test('statsd can talk to a server', function t(assert) {

    var server = UDPServer({
        port: 0
    }, onStarted);
    var messages = [];

    server.on('message', function onMessage(buf) {
        messages.push(String(buf));
    });

    function onStarted() {
        var port = server.address().port;

        var client = createStatsd({
            host: '127.0.0.1',
            project: 'my-app',
            port: port,
            packetQueue: {
                flush: 10
            },
            socketTimeout: 25
        });

        client.increment('some-stat');

        setTimeout(onStat, 50);

        function onStat() {
            assert.deepEqual(messages, [
                'my-app..' + os.hostname().split('.')[0] +
                    '.some-stat:1|c\n'
            ]);

            server.close();
            assert.end();
        }
    }
});

function UDPServer(opts, onBound) {
    if (!opts || typeof opts.port !== 'number') {
        throw new Error('UDPServer: `opts.port` required');
    }
    if (typeof onBound !== 'function') {
        throw new Error('UDPServer: `onBound` function is required');
    }

    var port = opts.port;

    var server = dgram.createSocket('udp4');
    server.bind(port, onBound);

    return server;
}
