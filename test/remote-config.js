'use strict';

var allocCluster = require('./lib/test-cluster.js');
var path = require('path');
var fs = require('fs');
var setTimeout = require('timers').setTimeout;

allocCluster.test('rate limiter should be configured correclty', {
    size: 1,
    remoteConfig: {
        'rateLimiting.enabled': true,
        'rateLimiting.totalRpsLimit': 1000,
        'rateLimiting.rpsLimitForServiceName': {
            'tom': 30,
            'bill': 55
        }
    },
    seedConfig: {
        'clients.remote-config': {
            'pollInterval': 5
        }
    }
}, function t(cluster, assert) {
    cluster.apps.forEach(function update(app) {
        var content = fs.readFileSync(path.join(__dirname, 'hyperbahn-remote-config.json'), 'utf8');
        app.remoteConfigFile.writeFile(content);
    });
    setTimeout(check, 20);
    function check() {
        cluster.apps.forEach(function checkApp(app) {
            var proxy = app.clients.serviceProxy;
            var rateLimiter = proxy.rateLimiter;
            assert.ok(proxy.rateLimiterEnabled, 'should be enabled');
            assert.equals(rateLimiter.totalRpsLimit, 1201, 'totalRpsLimit should be set');
            assert.equals(rateLimiter.rpsLimitForServiceName.nancy, 111, 'service nancy should be set');
            assert.equals(rateLimiter.rpsLimitForServiceName.bill, 60, 'service bill should be updated');
            assert.equals(rateLimiter.rpsLimitForServiceName.summer, 66, 'service summer should be set');
            assert.equals(rateLimiter.rpsLimitForServiceName.tom, undefined, 'service tom should be removed');
            assert.equals(rateLimiter.exemptServices.indexOf('sam'), 0, 'sam should be exempt');
            assert.equals(rateLimiter.exemptServices.indexOf('robert'), 1, 'robert should be exempt');
        });
        assert.end();
    }
});

allocCluster.test('rate limiter should handle the case when a property is removed', {
    size: 1,
    remoteConfig: {
        'rateLimiting.enabled': true,
        'rateLimiting.totalRpsLimit': 1000,
        'rateLimiting.exemptServices': [
                'summer',
                'nancy'
            ],
        'rateLimiting.rpsLimitForServiceName': {
            'tom': 30,
            'bill': 55
        }
    },
    seedConfig: {
        'clients.remote-config': {
            'pollInterval': 5
        }
    }
}, function t(cluster, assert) {
    cluster.apps.forEach(function update(app) {
        app.remoteConfigFile.writeFile('[]');
    });
    setTimeout(check, 20);
    function check() {
        cluster.apps.forEach(function checkApp(app) {
            var proxy = app.clients.serviceProxy;
            var rateLimiter = proxy.rateLimiter;
            assert.ok(!proxy.rateLimiterEnabled, 'should not be enabled');
            assert.equals(rateLimiter.totalRpsLimit, 1200, 'totalRpsLimit should be set to default');
            assert.equals(rateLimiter.rpsLimitForServiceName.tom, undefined, 'service tom should be removed');
            assert.equals(rateLimiter.rpsLimitForServiceName.bill, undefined, 'service bill should be removed');
            assert.equals(rateLimiter.exemptServices.length, 2, 'the exempt service should be set to default');
            assert.equals(rateLimiter.exemptServices.indexOf('autobahn'), 0, 'autobahn should be part of the default exempt service');
            assert.equals(rateLimiter.exemptServices.indexOf('ringpop'), 1, 'ringpop should be part of the default exempt service');
        });

        assert.end();
    }

});
