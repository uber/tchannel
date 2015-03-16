'use strict';

var console = require('console');
var CountedReadySignal = require('ready-signal/counted');

var TChannel = require('../index.js');

var ready = CountedReadySignal(2);
var server = new TChannel();
server.listen(4040, '127.0.0.1', ready.signal);
var client = new TChannel();
client.listen(4041, '127.0.0.1', ready.signal);

// normal response
server.register('func 1', function func1(arg1, arg2, peerInfo, cb) {
    console.log('func 1 responding immediately 1:' +
        arg1.toString() + ' 2:' + arg2.toString());
    cb(null, 'result', 'indeed it did');
});

// err response
server.register('func 2', function func2(arg1, arg2, peerInfo, cb) {
    cb(new Error('it failed'));
});

ready(function onReady() {
    client.send({
        host: '127.0.0.1:4040'
    }, 'func 1', 'arg 1', 'arg 2', function onResp1(err, res1, res2) {
        if (err) {
            console.log('unexpected err: ' + err.message);
        }
        console.log('normal res: ' + res1.toString() + ' ' + res2.toString());
    });

    client.send({
        host: '127.0.0.1:4040'
    }, 'func 2', 'arg 1', 'arg 2', function onResp2(err, res1, res2) {
        console.log('err res: ' + err.message);
    });
});
