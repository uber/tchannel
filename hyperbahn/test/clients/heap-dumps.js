'use strict';

var fs = require('fs');
var setTimeout = require('timers').setTimeout;

var allocCluster = require('../lib/test-cluster.js');

allocCluster.test('tchannel heap dumps', function t(cluster, assert) {
    var app = cluster.apps[0];

    cluster.logger.whitelist('warn', 'write a heapsnapshot');

    app.client.sendHeapDump(function onResponse(err, resp) {
        assert.ifError(err, 'send heap dump got an error');

        assert.ok(resp.body.path, 'heap dump does not return path');

        var logs = cluster.logger.items();
        assert.equal(logs.length, 1);
        assert.equal(logs[0].fields.msg, 'write a heapsnapshot');
        assert.equal(logs[0].fields.file, resp.body.path);

        setTimeout(onTimeout, 1000);

        function onTimeout() {
            fs.unlink(resp.body.path, assert.end);
        }
    });
});
