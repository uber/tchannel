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
var EndpointHandler = require('../endpoint-handler.js');
var CountedReadySignal = require('ready-signal/counted');

var server = new TChannel({
    handler: EndpointHandler()
});
var client = new TChannel({
    handler: EndpointHandler()
});
var client2 = new TChannel({timeoutCheckInterval: 100, timeoutFuzz: 5});

// normal response
server.handler.register('func 1', function (req, res) {
    console.log('func 1 responding immediately');
    res.sendOk('result', 'indeed it did');
});
// err response
server.handler.register('func 2', function (req, res) {
    res.sendNotOk(null, 'it failed');
});
// slow response
server.handler.register('func 3', function (req, res) {
    console.log('func 3 starting response timer');
    setTimeout(function () {
        console.log('func 3 responding now');
        res.sendOk('slow result', 'sorry for the delay');
    }, 1000);
});

// bidirectional messages
server.handler.register('ping', function onPing(req, res) {
    console.log('server got ping req from ' + req.remoteAddr);
    res.sendOk('pong', null);
});
client.handler.register('ping', function onPing(req, res) {
    console.log('client got ping req from ' + req.remoteAddr);
    res.sendOk('pong', null);
});

var ready = CountedReadySignal(3);

var listening = ready(function (err) {

    client
        .request({host: '0.0.0.0:4040'})
        .send('ping', null, null, function (err, res) {
            console.log('ping res from client: ' + res.arg2 + ' ' + res.arg3);
            server
                .request({host: '0.0.0.0:4041'})
                .send('ping', null, null, function (err, res) {
                    console.log('ping res server: ' + res.arg2 + ' ' + res.arg3);
                });
        });

    // very aggressive settings. Not recommended for real life.
    client2
        .request({host: '0.0.0.0:4040', timeout: 500})
        .send('func 3', 'arg2', 'arg3', function (err, res) {
            console.log('2 slow res: ' + formatRes(err, res));
            client2
                .request({host: '0.0.0.0:4040', timeout: 500})
                .send('func 3', 'arg2', 'arg3', function (err, res) {
                    console.log('3 slow res: ' + formatRes(err, res));
                });

            client2
                .request({host: '0.0.0.0:4040', timeout: 500})
                .send('func 3', 'arg2', 'arg3', function (err, res) {
                    console.log('4 slow res: ' + formatRes(err, res));
                });
        });

    client2
        .request({host: '0.0.0.0:4040', timeout: 500})
        .send('func 1', 'arg2', 'arg3', function (err, res) {
            console.log('1 fast res: ' + formatRes(err, res));
        });

});

server.listen(4040, '0.0.0.0', ready.signal);
client.listen(4041, '0.0.0.0', ready.signal);
client2.listen(4042, '0.0.0.0', ready.signal);

function formatRes(err, res) {
    var ret = [];


    if (err) {
        ret.push('err=' + err.message);
    }
    if (res && res.arg2) {
        ret.push('arg2=' + res.arg2.toString());
    }
    if (res && res.arg3) {
        ret.push('arg3=' + res.arg3.toString());
    }
    return ret.join(' ');
}
