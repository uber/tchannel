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

var Buffer = require('buffer').Buffer;
var allocCluster = require('./lib/alloc-cluster.js');
var TChannel = require('../channel.js');

allocCluster.test('request().send() to a server', 2, function t(cluster, assert) {
    var two = cluster.channels[1];

    var count = 0;

    function isBusy() {
        count += 1;

        if (count < 2) {
            return null;
        }

        else {
            return 'server is too busy';
        }
    }

    var one = TChannel({
        isBusy: isBusy
    });

    one.listen(0, '127.0.0.1', listening);

    var twoSubChan;

    function listening () {
        twoSubChan = two.makeSubChannel({
            serviceName: 'server',
            peers: [one.hostPort]
        });

        one.makeSubChannel({
            serviceName: 'server'
        }).register('foo', function foo(req, res, arg2, arg3) {
            assert.ok(Buffer.isBuffer(arg2), 'handler got an arg2 buffer');
            assert.ok(Buffer.isBuffer(arg3), 'handler got an arg3 buffer');
            res.headers.as = 'raw';
            res.sendOk(arg2, arg3);
        });

        twoSubChan.request({
            serviceName: 'server',
            hasNoParent: true,
            headers: {
                as: 'raw',
                cn: 'two'
            }
        }).send('foo', 'arg1', 'arg2', onResp);
    }

    function onResp(err, res, arg2, arg3) {
        twoSubChan.request({
            serviceName: 'server',
            hasNoParent: true,
            headers: {
                as: 'raw',
                cn: 'two'
            }
        }).send('foo', 'arg1', 'arg2', onResp2);
    }

    function onResp2(err, res, arg2, arg3) {
        assert.ok(isError(err), 'got an error');

        assert.equals(err.type, 'tchannel.busy');
        assert.ok(err.isErrorFrame, 'err isErrorFrame');
        assert.equals(err.codeName, 'Busy', 'error code name busy');
        assert.equals(err.fullType, 'tchannel.busy');

        one.close();

        assert.end();
    }
});

function isError(err) {
    return Object.prototype.toString.call(err) === '[object Error]';
}
