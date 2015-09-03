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

/* jshint maxparams:5 */
/*eslint max-params: [2, 5]*/

'use strict';

var path = require('path');
var fs = require('fs');

var TChannelAsThrift = require('../as/thrift.js');
var allocCluster = require('./lib/alloc-cluster.js');

var globalThriftText = fs.readFileSync(
    path.join(__dirname, 'anechoic-chamber.thrift'), 'utf8'
);

allocCluster.test('thrift works with health check present', {
    numPeers: 2
}, function t(cluster, assert) {
    var tchannelAsThrift = makeTChannelThriftServer(cluster, {
        okResponse: true
    });

    var client = cluster.channels[1].subChannels.server;

    tchannelAsThrift.send(client.request({
        serviceName: 'server',
        hasNoParent: true
    }), 'Chamber::echo', null, {
        value: 10
    }, function onResponse(err, res) {
        assert.ifError(err);

        assert.ok(res.ok);
        assert.equal(res.headers.as, 'thrift');
        assert.equal(res.body, 10);
        assert.end();
    });
});

allocCluster.test('health check works in good scenarios', {
    numPeers: 2
}, function t(cluster, assert) {
    makeTChannelThriftServer(cluster, {
        okResponse: true,
        good: true
    });

    var client = cluster.channels[1].subChannels.server;
    var source = fs.readFileSync(path.join(__dirname, '../as/meta.thrift'), 'utf8');
    var healthThrift = new TChannelAsThrift({
        source: source,
        logParseFailures: false
    });

    healthThrift.send(client.request({
        serviceName: 'server',
        hasNoParent: true
    }), 'Meta::health', null, {}, function onResponse(err, res) {
        if (err) {
            assert.end(false);
        }

        assert.ok(res && res.ok && res.body.ok, 'res should be ok');
        assert.end();
    });
});

allocCluster.test('health check works in bad scenarios', {
    numPeers: 2
}, function t(cluster, assert) {
    makeTChannelThriftServer(cluster, {
        okResponse: true,
        good: false
    });

    var client = cluster.channels[1].subChannels.server;
    var source = fs.readFileSync(path.join(__dirname, '../as/meta.thrift'), 'utf8');
    var healthThrift = new TChannelAsThrift({
        source: source,
        logParseFailures: false
    });

    healthThrift.send(client.request({
        serviceName: 'server',
        hasNoParent: true
    }), 'Meta::health', null, {}, function onResponse(err, res) {
        if (err) {
            assert.end(false);
        }

        assert.ok(res && res.ok && !res.body.ok, 'res body should not be ok');
        assert.equals(res.body.message, 'bad thing happened!', 'health check message should be returned');
        assert.end();
    });
});

function healthGood() {
    return {
        ok: true
    };
}

function healthBad() {
    return {
        ok: false,
        message: 'bad thing happened!'
    };
}

function makeTChannelThriftServer(cluster, opts) {
    var server = cluster.channels[0].makeSubChannel({
        serviceName: 'server'
    });

    cluster.channels[1].makeSubChannel({
        serviceName: 'server',
        peers: [
            cluster.channels[0].hostPort
        ],
        requestDefaults: {
            headers: {
                cn: 'wat'
            }
        }
    });

    var options = {
        isOptions: true
    };

    var health = opts.good ? healthGood : healthBad;

    var tchannelAsThrift = new TChannelAsThrift({
        source: opts.thriftText || globalThriftText,
        logParseFailures: false,
        channel: cluster.channels[0].subChannels.server,
        healthCheckCallback: health
    });
    tchannelAsThrift.register(server, 'Chamber::echo', options, okHandler);

    return tchannelAsThrift;

    function okHandler(opts, req, head, body, cb) {
        return cb(null, {
            ok: true,
            head: head,
            body: body.value
        });
    }
}
