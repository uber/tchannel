// Copyright (c) 2015 Uber Technologies, Inc.

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

var TChannel = require('../index.js');
var CountedReadySignal = require('ready-signal/counted');

var server = new TChannel();
var client = new TChannel();

// bidirectional messages
server.register('ping', function onPing(arg1, arg2, peerInfo, pingCb) {
    console.log('server got ping req from ' + peerInfo);
    pingCb(null, 'pong', null);
});
client.register('ping', function onPing(arg1, arg2, peerInfo, pingCb) {
    console.log('client got ping req from ' + peerInfo);
    pingCb(null, 'pong', null);
});


var ready = CountedReadySignal(2);
var listening = ready(function (err) {
    if (err) {
        throw err;
    }

    client.send({host: '127.0.0.1:4040'}, 'ping', null, null, function (err, res1, res2) {
        console.log('ping res from client: ' + res1 + ' ' + res2);
        server.send({host: '127.0.0.1:4041'}, 'ping', null, null, function (err, res1, res2) {
            console.log('ping res server: ' + res1 + ' ' + res2);
        });
    });

});

server.listen(4040, '127.0.0.1', ready.signal);
client.listen(4041, '127.0.0.1', ready.signal);
