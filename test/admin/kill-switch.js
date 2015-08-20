'use strict';

var Admin = require('../../bin/admin.js');
var allocCluster = require('../lib/test-cluster.js');

allocCluster.test('set kill switch and forward', {
    size: 4
}, function t(cluster, assert) {
    // var steve = cluster.remotes.steve;
    var bob = cluster.remotes.bob;

    Admin.exec('kill-switch --block *~~steve', {
        hosts: cluster.hostPortList
    }, function onBlock(err, arr) {
        assert.ifError(err);

        assert.equal(arr.length, 0);

        Admin.exec('kill-switch query', {
            hosts: cluster.hostPortList
        }, onQuery);
    });

    function onQuery(err, results) {
        assert.ifError(err);

        for (var i = 0; i < results.length; i++) {
            var result = results[i];

            var str = result.toString();
            assert.ok(str.indexOf('* ==> steve') >= 0);
        }

        bob.clientChannel.request({
            serviceName: 'steve',
            timeout: 10
        }).send('echo', null, JSON.stringify('oh hi lol'), onForwarded);
    }

    function onForwarded(err, res, arg2, arg3) {
        assert.ok(err, 'should fail');
        assert.equal(err && err.type, 'tchannel.request.timeout',
            'error type should be timeout');

        assert.end();
    }
});
