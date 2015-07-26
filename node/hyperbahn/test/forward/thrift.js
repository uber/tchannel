'use strict';

var fs = require('fs');
var path = require('path');
var someSpec = fs.readFileSync(
    path.join(__dirname, 'someSpec.thrift'), 'utf8'
);

var allocCluster = require('../lib/test-cluster.js');

allocCluster.test('register and forward with thrift', {
    size: 5
}, function t(cluster, assert) {
    var TChannelAsThrift = cluster.dummies[0].TChannelAsThrift;

    var steve = cluster.remotes.steve;
    var bob = cluster.remotes.bob;
    var tchannelThrift = TChannelAsThrift({
        source: someSpec
    });

    cluster.checkExitPeers(assert, {
        serviceName: steve.serviceName,
        hostPort: steve.hostPort
    });

    tchannelThrift.register(
        steve.serverChannel, 'echo::thrift_echo', {}, echo
    );

    function echo(ctx, req, arg2, arg3, cb) {
        cb(null, {
            ok: true,
            body: arg3
        });
    }

    tchannelThrift.send(bob.clientChannel.request({
        serviceName: 'steve'
    }), 'echo::thrift_echo', null, {
        foo: {
            bar: 2,
            baz: 'hi'
        }
    }, onForwarded);

    function onForwarded(err, res) {
        assert.ifError(err);

        assert.deepEqual(res.body, {
            foo: {
                bar: 2,
                baz: 'hi'
            }
        });

        assert.end();
    }
});
