'use strict';

var setTimeout = require('timers').setTimeout;

var allocCluster = require('./lib/alloc-cluster.js');

allocCluster.test('end response with error frame', {
    numPeers: 2
}, function t(cluster, assert) {
    var client = cluster.channels[0];
    var server = cluster.channels[1];

    server.makeSubChannel({
        serviceName: 'stream'
    }).register('stream', {
        streamed: true
    }, streamHandler);

    var req = client.request({
        serviceName: 'stream',
        host: server.hostPort,
        streamed: true
    });

    req.arg1.end('stream');
    req.arg2.end();
    req.arg3.end();

    req.on('response', onResponse);
    req.on('error', onError);

    function onResponse(resp) {
        assert.ok(resp);

        resp.on('finish', onResponseFinished);
        resp.on('error', onResponseError);

        function onResponseFinished() {
            assert.ok(false, 'expected no finished event');
        }

        function onResponseError(err) {
            assert.equal(err.message, 'oops');

            assert.end();
        }
    }

    function onError(err) {
        assert.ifError(err);
        assert.ok(false, 'expected no req error event');
    }

    function streamHandler(inreq, buildRes) {
        var res = buildRes({
            streamed: true
        });

        res.arg1.end();
        res.arg2.end();

        res.arg3.write('a message');

        setTimeout(function datTime() {
            res.sendError('UnexpectedError', 'oops');
        }, 500);
    }
});
