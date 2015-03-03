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
var client2 = new TChannel({timeoutCheckInterval: 100, timeoutFuzz: 5});

// normal response
server.register('func 1', function (arg1, arg2, peerInfo, cb) {
	console.log('func 1 responding immediately');
	cb(null, 'result', 'indeed it did');
});
// err response
server.register('func 2', function (arg1, arg2, peerInfo, cb) {
	cb(new Error('it failed'));
});
// slow response
server.register('func 3', function (arg1, arg2, peerInfo, cb) {
	console.log('func 3 starting response timer');
	setTimeout(function () {
		console.log('func 3 responding now');
		cb(null, 'slow result', 'sorry for the delay');
	}, 1000);
});

// bidirectional messages
server.register('ping', function onPing(arg1, arg2, peerInfo, pingCb) {
	console.log('server got ping req from ' + peerInfo);
	pingCb(null, 'pong', null);
});
client.register('ping', function onPing(arg1, arg2, peerInfo, pingCb) {
	console.log('client got ping req from ' + peerInfo);
	pingCb(null, 'pong', null);
});

var ready = CountedReadySignal(3);

var listening = ready(function (err) {

    client.send({host: '127.0.0.1:4040'}, 'ping', null, null, function (err, res1, res2) {
        console.log('ping res from client: ' + res1 + ' ' + res2);
        server.send({host: '127.0.0.1:4041'}, 'ping', null, null, function (err, res1, res2) {
            console.log('ping res server: ' + res1 + ' ' + res2);
        });
    });

    // very aggressive settings. Not recommended for real life.
    client2.send({host: '127.0.0.1:4040', timeout: 500}, 'func 3', 'arg2', 'arg3', function (err, res1, res2) {
        console.log('2 slow res: ' + formatRes(err, res1, res2));
        client2.send({host: '127.0.0.1:4040', timeout: 500}, 'func 3', 'arg2', 'arg3', function (err, res1, res2) {
            console.log('3 slow res: ' + formatRes(err, res1, res2));
        });

        client2.send({host: '127.0.0.1:4040', timeout: 500}, 'func 3', 'arg2', 'arg3', function (err, res1, res2) {
            console.log('4 slow res: ' + formatRes(err, res1, res2));
        });
    });

    client2.send({host: '127.0.0.1:4040', timeout: 500}, 'func 1', 'arg2', 'arg3', function (err, res1, res2) {
        console.log('1 fast res: ' + formatRes(err, res1, res2));
    });

});

server.listen(4040, '127.0.0.1', ready.signal);
client.listen(4041, '127.0.0.1', ready.signal);
client2.listen(4042, '127.0.0.1', ready.signal);

function formatRes(err, res1, res2) {
	var ret = [];

	if (err) {
		ret.push('err=' + err.message);
	}
	if (res1) {
		ret.push('res1=' + res1.toString());
	}
	if (res2) {
		ret.push('res2=' + res2.toString());
	}
	return ret.join(' ');
}
