var NullLogtron = require('null-logtron');
var TChannelJSON = require('../as/json');
var TChannel = require('../');

var server = TChannel({
    serviceName: 'server',
    logger: NullLogtron()
});
var client = TChannel({
    logger: NullLogtron()
});
var tchannelJSON = TChannelJSON({
    logger: NullLogtron()
});

var context = {};

tchannelJSON.register(server, 'echo', context, echo);
function echo(context, req, head, body, callback) {
    callback(null, {
        ok: true,
        head: head,
        body: body
    });
}

server.listen(4040, '127.0.0.1', onListening);

function onListening() {
    tchannelJSON.send(client.request({
        serviceName: 'server',
        host: '127.0.0.1:4040'
    }), 'echo', {
        head: 'object'
    }, {
        body: 'object'
    }, onResponse);

    function onResponse(err, resp) {
        if (err) {
            console.log('got error', err);
        } else {
            console.log('got resp', resp);
        }

        server.close();
    }
}
