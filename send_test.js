
var TChannel = require('./index');

var server = new TChannel({host: '127.0.0.1', port: 4040});
var client = new TChannel({host: '127.0.0.1', port: 4041});

server.register('func 1', function (arg1, arg2, peerInfo, cb) {
	console.dir(peerInfo);
	cb(null, 'result', 'indeed it did');
});
server.register('func 2', function (arg1, arg2, peerInfo, cb) {
	cb(new Error('it failed'));
});
server.register('ping', function onPing(arg1, arg2, peerInfo, pingCb) {
	console.log('server got ping req from ' + peerInfo);
	pingCb(null, 'pong', null);
});
client.register('ping', function onPing(arg1, arg2, peerInfo, pingCb) {
	console.log('client got ping req from ' + peerInfo);
	pingCb(null, 'pong', null);
});

client.send({host: '127.0.0.1:4040'}, 'ping', null, null, function (err, res1, res2) {
	console.log('ping res from client: ' + res1 + ' ' + res2);
	server.send({host: '127.0.0.1:4041'}, 'ping', null, null, function (err, res1, res2) {
		console.log('ping res server: ' + res1 + ' ' + res2);
	});
});

var remaining = 100;
var start = Date.now();

function onRes(err, res1, res2) {
	remaining--;
	console.log(remaining + ' ' + res1.toString('utf8') + ' ' + res2.toString('utf8'));
	if (remaining === 0) {
		var delta = Date.now() - start;
		console.log('completed test in ' + delta + 'ms');
	}
}

for (var i = 0; i < remaining; i++) {
	client.send({host: '127.0.0.1:4040'}, 'func 1', '0123456789', 'abcdefg', onRes);
}
