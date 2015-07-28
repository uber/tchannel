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

var parallel = require('run-parallel');
var MockTimers = require('time-mock');
var allocCluster = require('./lib/alloc-cluster.js');

allocCluster.test('requests are balanced evenly across peers', {
    numPeers: 5,
    timers: MockTimers(Date.now()),
    channelOptions: {
        random: winning
    }
}, function t(cluster, assert) {
    var requestsPerPeer = 2;

    cluster.tiberii = cluster.channels.map(function makeTiberius(channel) {
        return channel.makeSubChannel({
            serviceName: 'tiberius'
        });
    });

    cluster.connectChannels(cluster.tiberii, onCliqued);

    function onCliqued(err, value) {
        if (err) return assert.end(err);

        setupServiceCluster(cluster);

        var head = cluster.tiberii[0];
        var tail = cluster.hosts.slice(1);

        var jobs = [];
        var responderCounts = {};
        var requestCount = (cluster.channels.length - 1) * requestsPerPeer;
        for (var index = 0; index < requestCount; index++) {
            /*jshint -W083 */
            jobs.push(function sendRequest(callback) {
                head.request({
                    serviceName: 'tiberius',
                    timeout: 2000,
                    hasNoParent: true,
                    headers: {
                        'as': 'raw',
                        'cn': 'wat'
                    }
                }).send('slow', 'okay?', 'okay?', onResponse);
                function onResponse(err, res, hostPort, result) {
                    responderCounts[hostPort] = (responderCounts[hostPort] || 0) + 1;
                    callback();
                }
            });
            /*jshint +W083 */
        }

        parallel(jobs, onDone);

        setTimeout(function () {
            cluster.timers.advance(500);
            setTimeout(function () {
                cluster.timers.advance(Infinity);
            }, 200);
        }, 200);

        function onDone(err) {
            if (err) return assert.end(err);
            for (var index = 0; index < tail.length; index++) {
                var count = responderCounts[tail[index]];
                assert.equal(count, requestsPerPeer, 'responder ' + index + ' received 2 requests');
            }
            assert.end();
        }
    }
});


function setupServiceCluster(cluster) {
    cluster.tiberii.forEach(function (tiberius) {
        tiberius.register('slow', function (req, res) {
            cluster.timers.setTimeout(function delayedOk() {
                res.headers.as = 'raw';
                res.sendOk(tiberius.hostPort, 'dokie');
            }, 500);
        });
    });
}

function winning() {
    // It is necessary for the random variable to return a non-1 value for the
    // weighted distribution based on pending requests to result in non-1
    // values.
    return 0.5;
}
