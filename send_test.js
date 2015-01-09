
var TChannel = require('./index');

var server = new TChannel({host: '127.0.0.1', port: 4040});
// var client = new TChannel({host: '127.0.0.1', port: 4041});

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

// // bidirectional messages
// server.register('ping', function onPing(arg1, arg2, peerInfo, pingCb) {
// 	console.log('server got ping req from ' + peerInfo);
// 	pingCb(null, 'pong', null);
// });
// client.register('ping', function onPing(arg1, arg2, peerInfo, pingCb) {
// 	console.log('client got ping req from ' + peerInfo);
// 	pingCb(null, 'pong', null);
// });
// client.send({host: '127.0.0.1:4040'}, 'ping', null, null, function (err, res1, res2) {
// 	console.log('ping res from client: ' + res1 + ' ' + res2);
// 	server.send({host: '127.0.0.1:4041'}, 'ping', null, null, function (err, res1, res2) {
// 		console.log('ping res server: ' + res1 + ' ' + res2);
// 	});
// });

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

// very aggressive settings. Not recommended for real life.
var client2 = new TChannel({host: '127.0.0.1', port: 4042, timeoutCheckInterval: 100, timeoutFuzz: 5});
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
