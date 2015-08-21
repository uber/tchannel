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
