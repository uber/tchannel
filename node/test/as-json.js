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
var test = require('tape');

var TChannelJSON = require('../as/json.js');
var allocCluster = require('./lib/alloc-cluster.js');

test('TChannelJSON options are optional', function t(assert) {
    assert.doesNotThrow(function noThrow() {
        TChannelJSON();
    });

    assert.end();
});

allocCluster.test('getting an ok response', {
    numPeers: 2
}, function t(cluster, assert) {
    var tchannelJSON = makeTChannelJSONServer(cluster, {
        okResponse: true
    });

    var client = cluster.channels[1].subChannels.server;

    tchannelJSON.send(client.request({
        serviceName: 'server',
        hasNoParent: true,
        timeout: 1500
    }), 'echo', {
        some: 'head'
    }, {
        some: 'body'
    }, function onResponse(err, resp) {
        assert.ifError(err);

        assert.deepEqual(resp, {
            ok: true,
            head: null,
            headers: {
                'as': 'json'
            },
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
                serviceName: 'server'
            }
        });
        assert.end();
    });
});

allocCluster.test('sending using request()', {
    numPeers: 2
}, function t(cluster, assert) {
    var tchannelJSON = makeTChannelJSONServer(cluster, {
        okResponse: true
    });

    tchannelJSON.request({
        serviceName: 'server',
        hasNoParent: true,
        timeout: 1500
    }).send('echo', null, 'body', function onResponse(err, resp) {
        assert.ifError(err);

        assert.ok(resp.ok);
        assert.equal(resp.body.body, 'body');

        assert.end();
    });
});

allocCluster.test('getting a not ok response', {
    numPeers: 2
}, function t(cluster, assert) {
    var tchannelJSON = makeTChannelJSONServer(cluster, {
        notOkResponse: true
    });

    var client = cluster.channels[1].subChannels.server;

    tchannelJSON.send(client.request({
        serviceName: 'server',
        timeout: 1500,
        hasNoParent: true
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
            headers: {
                'as': 'json'
            },
            body: {
                message: 'my error',
                type: 'my-error',
                fullType: 'my-error',
                someField: 'some field',
                name: 'MyErrorError'
            }
        });
        assert.end();
    });
});

allocCluster.test('getting an UnexpectedError frame', {
    numPeers: 2
}, function t(cluster, assert) {
    var tchannelJSON = makeTChannelJSONServer(cluster, {
        networkFailureResponse: true
    });

    var client = cluster.channels[1].subChannels.server;

    client.logger.whitelist(
        'error',
        'Got unexpected error in handler'
    );

    tchannelJSON.send(client.request({
        serviceName: 'server',
        timeout: 1500,
        hasNoParent: true
    }), 'echo', null, null, function onResponse(err, resp) {
        assert.ok(err);
        assert.equal(err.isErrorFrame, true);
        assert.equal(err.codeName, 'UnexpectedError');
        assert.equal(err.message, 'Unexpected Error');

        assert.equal(resp, undefined);
        assert.equal(client.logger.items().length, 1);

        assert.end();
    });
});

allocCluster.test('getting a BadRequest frame', {
    numPeers: 2
}, function t(cluster, assert) {
    makeTChannelJSONServer(cluster, {
        networkFailureResponse: true
    });

    var client = cluster.channels[1].subChannels.server;

    client.request({
        serviceName: 'server',
        timeout: 1500,
        headers: {
            as: 'json'
        },
        hasNoParent: true
    }).send('echo', '123malformed json', null, onResponse);

    function onResponse(err, resp) {
        assert.ok(err);

        assert.equal(err.isErrorFrame, true);
        assert.equal(err.codeName, 'BadRequest');
        assert.equal(err.message,
            'tchannel.json-handler.parse-error.head-failed: Could not ' +
                'parse head (arg2) argument.\n' +
                'Expected JSON encoded arg2 for endpoint echo.\n' +
                'Got 123malform instead of JSON.'
        );

        assert.equal(resp, null);

        assert.end();
    }
});

allocCluster.test('sending without as header', {
    numPeers: 2
}, function t(cluster, assert) {
    makeTChannelJSONServer(cluster, {
        networkFailureResponse: true
    });

    var client = cluster.channels[1].subChannels.server;

    client.request({
        serviceName: 'server',
        timeout: 1500,
        hasNoParent: true,
        headers: {
            as: 'lol'
        },
    }).send('echo', '123malformed json', null, onResponse);

    function onResponse(err, resp) {
        assert.ok(err);

        assert.equal(err.isErrorFrame, true);
        assert.equal(err.codeName, 'BadRequest');
        assert.equal(err.message,
            'Expected call request as header to be json');

        assert.equal(resp, null);

        assert.end();
    }
});

function makeTChannelJSONServer(cluster, opts) {
    var server = cluster.channels[0].makeSubChannel({
        serviceName: 'server'
    });

    // allocat subChannel in client pointing to server
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

    var fn = opts.okResponse ? okHandler :
        opts.notOkResponse ? notOkHandler :
        opts.networkFailureResponse ? networkFailureHandler :
            networkFailureHandler;

    var tchannelJSON = cluster.channels[0].TChannelAsJSON({
        logParseFailures: false,
        channel: cluster.channels[1].subChannels.server
    });
    tchannelJSON.register(server, 'echo', options, fn);

    return tchannelJSON;

    function okHandler(opts, req, head, body, cb) {
        cb(null, {
            ok: true,
            head: null,
            body: {
                opts: opts,
                head: head,
                body: body,
                serviceName: req.serviceName
            }
        });
    }

    function notOkHandler(opts, req, head, body, cb) {
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

    function networkFailureHandler(opts, req, head, body, cb) {
        var networkError = new Error('network failure');

        cb(networkError);
    }
}
