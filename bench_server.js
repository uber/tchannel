var TChannel = require('./index');
var server = new TChannel({listen: '127.0.0.1', port: 4040});

var keys = {};

server.on('socket close', function (conn, err) {
	console.log('socket close: ' + conn.remoteName + ' ' + err);
});

server.register('ping', function onPing(arg1, arg2, hostInfo, pingCb) {
	pingCb(null, 'pong', null);
});

function safeParse(str) {
	try {
		return JSON.parse(str);
	} catch (e) {
		return null;
	}
}

server.register('set', function onSet(arg1, arg2, hostInfo, setCb) {
	var parts = safeParse(arg1.toString('utf8'));
	keys[parts[0]] = parts[1];
	setCb(null, 'ok', 'really ok');
});

server.register('get', function onGet(arg1, arg2, hostInfo, getCb) {
	var str = arg1.toString('utf8');
	if (keys[str] !== undefined) {
		getCb(null, keys[str].length, keys[str]);
	} else {
		getCb(new Error('key not found: ' + str));
	}
});

setInterval(function () {
	Object.keys(keys).forEach(function (key) {
		console.log(key + '=' + keys[key].length + ' bytes');
	});
}, 1000);
