'use strict';

var Admin = require('../../bin/admin.js');
var allocCluster = require('../lib/test-cluster.js');

allocCluster.test('disable rate limiter and forward', {
    size: 3
}, function t(cluster, assert) {
    var bob = cluster.remotes.bob;

    Admin.exec('rate-limiter disable', {
        hosts: cluster.hostPortList
    }, function onSet1(err, arr) {
        assert.ifError(err);
        assert.equal(arr.length, 0);

        Admin.exec('rate-limiter total-limit 0', {
            hosts: cluster.hostPortList
        }, onSet2);
    });

    function onSet2(err, arr) {
        assert.ifError(err);
        assert.equal(arr.length, 0);

        Admin.exec('rate-limiter query', {
            hosts: cluster.hostPortList
        }, onQuery);
    }

    function onQuery(err, results) {
        assert.ifError(err);

        for (var i = 0; i < results.length; i++) {
            var result = results[i];
            assert.equal(result.settings.enabled, false, 'disable should work');
            assert.equal(result.settings.totalRpsLimit, 0, 'set totalRpsLimit should work');
        }

        bob.clientChannel.request({
            serviceName: 'steve',
            timeout: 10
        }).send('echo', null, JSON.stringify('oh hi lol'), onForwarded);
    }

    function onForwarded(err, res, arg2, arg3) {
        assert.ok(!err && res, 'should not fail');
        assert.end();
    }
});

allocCluster.test('set total rate limiter and forward', {
    size: 1,
    remoteConfig: {
        'rateLimiting.enabled': true,
        'rateLimiting.totalRpsLimit': 2,
        'rateLimiting.rpsLimitForServiceName': {
            'steve': 10
        },
        'rateLimiting.exemptServices': [
            'hyperbahn',
            'autobahn',
            'ringpop',
            'tcollector'
        ]
    }
}, function t(cluster, assert) {
    var bob = cluster.remotes.bob;

    Admin.exec('rate-limiter total-limit 0', {
        hosts: cluster.hostPortList
    }, function onSet(err, arr) {
        assert.ifError(err);
        assert.equal(arr.length, 0);

        Admin.exec('rate-limiter query', {
            hosts: cluster.hostPortList
        }, onQuery);
    });

    function onQuery(err, results) {
        assert.ifError(err);

        for (var i = 0; i < results.length; i++) {
            var result = results[i];
            assert.equal(result.settings.totalRpsLimit, 0, 'set totalRpsLimit should work');
            assert.equal(result.settings.rpsLimitForServiceName.steve, 10, 'set service limit should not affect others');
        }

        bob.clientChannel.request({
            serviceName: 'steve',
            timeout: 10
        }).send('echo', null, JSON.stringify('oh hi lol'), onReq);

        function onReq(err2) {
            assert.ifError(err2);

            bob.clientChannel.request({
                serviceName: 'steve',
                timeout: 10
            }).send('echo', null, JSON.stringify('oh hi lol'), onForwarded);
        }
    }

    function onForwarded(err, res, arg2, arg3) {
        assert.ok(err, 'should fail');
        assert.equal(err && err.type, 'tchannel.busy',
            'error type should be busy');

        assert.end();
    }
});

allocCluster.test('set service rate limiter and forward', {
    size: 1,
    remoteConfig: {
        'rateLimiting.enabled': true,
        'rateLimiting.totalRpsLimit': 1000,
        'rateLimiting.rpsLimitForServiceName': {
            'steve': 10
        },
        'rateLimiting.exemptServices': [
            'hyperbahn',
            'ringpop',
            'tcollector'
        ]
    }
}, function t(cluster, assert) {
    var bob = cluster.remotes.bob;

    Admin.exec('rate-limiter limit steve 1', {
        hosts: cluster.hostPortList
    }, function onSet(err, arr) {
        assert.ifError(err);
        assert.equal(arr.length, 0);

        Admin.exec('rate-limiter query', {
            hosts: cluster.hostPortList
        }, onQuery);
    });

    function onQuery(err, results) {
        assert.ifError(err);

        for (var i = 0; i < results.length; i++) {
            var result = results[i];
            assert.equal(result.settings.rpsLimitForServiceName.steve, 1, 'set service limit should work');
            assert.equal(result.settings.totalRpsLimit, 1000, 'set service limit should not affect others');
        }

        forward();
    }

    var count = 0;
    function forward() {
        var cb;
        if (count++ <= 1) {
            cb = forward;
        } else {
            cb = onForwarded;
        }
        bob.clientChannel.request({
            serviceName: 'steve',
            timeout: 10
        }).send('echo', null, JSON.stringify('oh hi lol'), cb);
    }

    function onForwarded(err, res, arg2, arg3) {
        assert.ok(err, 'should fail');
        assert.equal(err && err.type, 'tchannel.busy',
            'error type should be busy');

        assert.end();
    }
});

allocCluster.test('set exempt service and forward', {
    size: 2,
    remoteConfig: {
        'rateLimiting.enabled': true,
        'rateLimiting.totalRpsLimit': 1000,
        'rateLimiting.rpsLimitForServiceName': {
            'steve': 0
        },
        'rateLimiting.exemptServices': [
            'hyperbahn',
            'ringpop',
            'tcollector'
        ]
    }
}, function t(cluster, assert) {
    var bob = cluster.remotes.bob;

    Admin.exec('rate-limiter exempt add steve', {
        hosts: cluster.hostPortList
    }, function onSet(err, arr) {
        assert.ifError(err);
        assert.equal(arr.length, 0);

        Admin.exec('rate-limiter query', {
            hosts: cluster.hostPortList
        }, onQuery);
    });

    function onQuery(err, results) {
        assert.ifError(err);

        for (var i = 0; i < results.length; i++) {
            var result = results[i];
            assert.equal(result.settings.exemptServices[3], 'steve', 'set exempt services should work');
        }

        bob.clientChannel.request({
            serviceName: 'steve',
            timeout: 10
        }).send('echo', null, JSON.stringify('oh hi lol'), onForwarded);
    }

    function onForwarded(err, res, arg2, arg3) {
        assert.ok(!err, 'should not fail');
        assert.end();
    }
});
