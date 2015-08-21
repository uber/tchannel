// Copyright (c) 2015 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

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
