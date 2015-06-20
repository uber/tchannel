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

var DebugLogtron = require('debug-logtron');

var HyperbahnClient = require('../../hyperbahn/index.js');
var HyperbahnCluster = require('../lib/hyperbahn-cluster.js');
var TChannelJSON = require('../../as/json');

HyperbahnCluster.test('register and forward', {
    size: 5
}, function t(cluster, assert) {
    var steve = cluster.remotes.steve;
    var bob = cluster.remotes.bob;

    var tchannelJSON = TChannelJSON({
        logger: cluster.logger
    });

    var steveAutobahnClient = new HyperbahnClient({
        serviceName: steve.serviceName,
        callerName: 'forward-test',
        hostPortList: cluster.hostPortList,
        tchannel: steve.channel,
        logger: DebugLogtron('autobahnClient')
    });
    steveAutobahnClient.once('registered', onRegistered);
    steveAutobahnClient.register();

    function onRegistered() {
        var result = steveAutobahnClient.latestRegistrationResult;

        assert.equal(result.head, null, 'header is null');
        assert.ok(result.body, 'got a body');

        assert.equal(typeof result.body.connectionCount, 'number');

        tchannelJSON.send(bob.clientChannel.request({
            timeout: 5000,
            serviceName: steve.serviceName
        }), 'echo', null, 'oh hi lol', onForwarded);

    }

    function onForwarded(err, resp) {
        assert.ifError(err);
        assert.equal(String(resp.body), 'oh hi lol');

        steveAutobahnClient.destroy();
        assert.end();
    }
});
