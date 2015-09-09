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
var fs = require('fs');
var path = require('path');

var TChannelAsThrift = require('../../as/thrift');
var HyperbahnClient = require('../../hyperbahn/index.js');

var source = fs.readFileSync(path.join(__dirname, '../../hyperbahn/hyperbahn.thrift'), 'utf8');
var thrift = new TChannelAsThrift({source: source});

module.exports = runTests;

if (require.main === module) {
    runTests(require('../lib/hyperbahn-cluster.js'));
}

function runTests(HyperbahnCluster) {
    HyperbahnCluster.test('get no host', {
        size: 5
    }, function t(cluster, assert) {
        var bob = cluster.remotes.bob;
        var bobSub = bob.channel.makeSubChannel({
            serviceName: 'hyperbahn',
            peers: cluster.hostPortList
        });
        var request = bobSub.request({
            headers: {
                cn: 'test'
            },
            serviceName: 'hyperbahn',
            hasNoParent: true
        });
        thrift.send(request,
            'Hyperbahn::discover',
            null,
            {
                query: {
                    serviceName: 'matt'
                }
            },
            onResponse
        );
        function onResponse(err, res) {
            assert.ok(!err, 'should be no errors');
            assert.ok(res, 'should be a result');
            assert.ok(!res.ok, 'result should be not ok');
            assert.equals(res.body.message, 'no peer available for matt', 'error message as expected');
            assert.end();
        }
    });

    HyperbahnCluster.test.only('get host port as expected', {
        size: 5
    }, function t(cluster, assert) {
        var bob = cluster.remotes.bob;
        var steve = cluster.remotes.steve;
        var steveSub = steve.channel.makeSubChannel({
            serviceName: 'hyperbahn',
            peers: cluster.hostPortList
        });
        var request = steveSub.request({
            headers: {
                cn: 'test'
            },
            serviceName: 'hyperbahn',
            hasNoParent: true
        });

        var client = new HyperbahnClient({
            serviceName: 'hello-bob',
            callerName: 'hello-bob-test',
            hostPortList: cluster.hostPortList,
            tchannel: bob.channel,
            logger: DebugLogtron('hyperbahnClient')
        });

        client.once('advertised', onResponse);
        client.advertise();

        function onResponse() {
            thrift.send(request,
                'Hyperbahn::discover',
                null,
                {
                    query: {
                        serviceName: 'hello-bob'
                    }
                },
                check
            );
        }

        function check(err, res) {
            assert.ok(!err, 'should be no errors');
            assert.ok(res, 'should be a result');
            assert.ok(res.ok, 'result should be ok');
            assert.equals(res.body[0], bob.channel.hostPort, 'should get the expected hostPort');
            client.destroy();
            assert.end();
        }
    });
}
