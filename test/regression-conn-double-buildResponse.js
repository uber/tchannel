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

var allocCluster = require('./lib/alloc-cluster.js');

allocCluster.test('conn double buildResponse: build send build sendError', {
    numPeers: 2
}, function t(cluster, assert) {
    var one = cluster.channels[0];
    var two = cluster.channels[1];

    var subTwo = two.makeSubChannel({
        serviceName: 'server',
        peers: [one.hostPort]
    });

    cluster.logger.whitelist(
        'error',
        'outgoing response has an error'
    );

    one.makeSubChannel({
        serviceName: 'server'
    }).register('/foo', {streamed: true}, bsbseHandler);
    var peer = two.peers.get(one.hostPort);
    peer.waitForIdentified(runTest);

    function runTest(err) {
        if (err) {
            assert.end(err);
            return;
        }

        subTwo.request({
            serviceName: 'server',
            hasNoParent: true,
            timeout: 100,
            headers: {
                cn: 'jaker',
                as: 'raw'
            }
        }).send('/foo', 'h', 'b', gotFoo);
    }

    function gotFoo(err, res, arg2, arg3) {
        assert.equal(err, null, 'expected to response error');

        assert.equal(String(arg2), 'such', 'expected response arg2');
        assert.equal(String(arg3), 'results', 'expected response arg3');

        var lines = cluster.logger.items();
        assert.equal(lines.length, 2);
        var record1 = lines[0];
        var record2 = lines[1];

        assert.deepEqual(pluckErrorLog(record1), {
            levelName: 'error',
            msg: 'outgoing response has an error',
            errorType: 'tchannel.response-already-done',
            errorMessage: 'cannot send send error frame: ' +
                          'UnexpectedError: response already started (state 2)' +
                          ', response already done in state: 2'
        }, 'expected first error log');

        assert.deepEqual(pluckErrorLog(record2), {
            levelName: 'error',
            msg: 'outgoing response has an error',
            errorType: 'tchannel.response-already-done',
            errorMessage: 'cannot send send error frame: ' +
                          'UnexpectedError: nope' +
                          ', response already done in state: 2'
        }, 'expected second error log');

        assert.end();
    }
});

function bsbseHandler(req, buildRes) {
    buildRes({headers: {as: 'raw'}}).send('such', 'results');
    buildRes().sendError('UnexpectedError', 'nope');
}

function pluckErrorLog(rec) {
    return {
        levelName: rec && rec.levelName,
        msg: rec && rec.msg,
        errorType: rec && rec.meta.error.type,
        errorMessage: rec && rec.meta.error.message
    };
}
