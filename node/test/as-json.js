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

/* jshint maxparams:5 */

var TypedError = require('error/typed');

var TChannelJSON = require('../as/json.js');

var allocCluster = require('./lib/alloc-cluster.js');

allocCluster.test('getting an ok response', {
    numPeers: 2
}, function t(cluster, assert) {
    var server = cluster.channels[0].makeSubChannel({
        serviceName: 'server'
    });
    var client = cluster.channels[1];

    var opts = {
        isOptions: true
    };

    var tchannelJSON = TChannelJSON();
    tchannelJSON.register(server, 'echo', opts, echo);

    tchannelJSON.send(client.request({
        service: 'server',
        timeout: 1500,
        host: server.hostPort
    }), 'echo', {
        some: 'head'
    }, {
        some: 'body'
    }, function onResponse(err, resp) {
        assert.ifError(err);

        assert.deepEqual(resp, {
            ok: true,
            head: null,
            body: {
                opts: {
                    isOptions: true
                },
                head: {
                    some: 'head'
                },
                body: {
                    some: 'body'
                },
                service: 'server'
            }
        });
        assert.end();
    });

    function echo(opts, req, head, body, cb) {
        cb(null, {
            ok: true,
            head: null,
            body: {
                opts: opts,
                head: head,
                body: body,
                service: req.service
            }
        });
    }
});

allocCluster.test('getting a not ok response', {
    numPeers: 2
}, function t(cluster, assert) {
    var server = cluster.channels[0].makeSubChannel({
        serviceName: 'server'
    });
    var client = cluster.channels[1];

    var opts = {
        isOptions: true
    };

    var tchannelJSON = TChannelJSON();
    tchannelJSON.register(server, 'echo', opts, echo);

    tchannelJSON.send(client.request({
        service: 'server',
        timeout: 1500,
        host: server.hostPort
    }), 'echo', {
        some: 'head'
    }, {
        some: 'body'
    }, function onResponse(err, resp) {
        assert.ifError(err);

        assert.ok(resp.body.stack);

        assert.deepEqual(resp, {
            ok: false,
            head: null,
            body: {
                message: 'my error',
                type: 'my-error',
                someField: 'some field',
                name: 'MyErrorError'
            }
        });
        assert.end();
    });

    function echo(opts, req, head, body, cb) {
        var MyError = TypedError({
            message: 'my error',
            type: 'my-error'
        });

        cb(null, {
            ok: false,
            head: null,
            body: MyError({
                someField: 'some field'
            })
        });
    }
});

allocCluster.test('getting an UnexpectedError frame', {
    numPeers: 2
}, function t(cluster, assert) {
    var server = cluster.channels[0].makeSubChannel({
        serviceName: 'server'
    });
    var client = cluster.channels[1];

    var opts = {
        isOptions: true
    };

    var tchannelJSON = TChannelJSON();
    tchannelJSON.register(server, 'echo', opts, echo);

    tchannelJSON.send(client.request({
        service: 'server',
        timeout: 1500,
        host: server.hostPort
    }), 'echo', {
        some: 'head'
    }, {
        some: 'body'
    }, function onResponse(err, resp) {
        assert.ok(err);
        assert.equal(err.isErrorFrame, true);
        assert.equal(err.codeName, 'UnexpectedError');
        assert.equal(err.message, 'Unexpected Error');

        assert.equal(resp, undefined);

        assert.end();
    });

    function echo(opts, req, head, body, cb) {
        var networkError = new Error('network failure');

        cb(networkError);
    }
});


allocCluster.test('getting a BadRequest frame', {
    numPeers: 2
}, function t(cluster, assert) {
    var server = cluster.channels[0].makeSubChannel({
        serviceName: 'server'
    });
    var client = cluster.channels[1];

    var opts = {
        isOptions: true
    };

    var tchannelJSON = TChannelJSON();
    tchannelJSON.register(server, 'echo', opts, echo);

    client.request({
        service: 'server',
        timeout: 1500,
        headers: {
            as: 'json'
        },
        host: server.hostPort
    }).send('echo', '123malformed json', null, onResponse);

    function onResponse(err, resp) {
        assert.ok(err);

        assert.equal(err.isErrorFrame, true);
        assert.equal(err.codeName, 'BadRequest');
        assert.equal(err.message,
            'tchannel-handler.parse-error.head-failed: Could not ' +
                'parse head (arg2) argument.\n' +
                'Expected JSON encoded arg2 for endpoint echo.\n' +
                'Got 123malform instead of JSON.'
        );

        assert.equal(resp, null);

        assert.end();
    }

    function echo(opts, req, head, body, cb) {
        var networkError = new Error('network failure');

        cb(networkError);
    }
});
