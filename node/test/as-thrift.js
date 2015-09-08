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
var TypedError = require('error/typed');
var fs = require('fs');

var allocCluster = require('./lib/alloc-cluster.js');

var globalThriftText = fs.readFileSync(
    path.join(__dirname, 'anechoic-chamber.thrift'), 'utf8'
);
var badThriftText = fs.readFileSync(
    path.join(__dirname, 'bad-anechoic-chamber.thrift'), 'utf8'
);

allocCluster.test('send and receiving an ok', {
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

allocCluster.test('send and receiving an big request', {
    numPeers: 2
}, function t(cluster, assert) {
    var tchannelAsThrift = makeTChannelThriftServer(cluster, {
        okResponse: true
    });

    var client = cluster.channels[1].subChannels.server;

    var largeList = [];
    for (var i = 0; i < 10 * 1000; i++) {
        largeList.push('abcdefgh');
    }

    tchannelAsThrift.send(client.request({
        serviceName: 'server',
        hasNoParent: true
    }), 'Chamber::echo_big', null, {
        value: largeList
    }, function onResponse(err, res) {
        assert.ifError(err);

        assert.ok(res.ok);
        assert.equal(res.headers.as, 'thrift');
        assert.equal(res.body, 10 * 1000);
        assert.end();
    });
});

allocCluster.test('sending using request()', {
    numPeers: 2
}, function t(cluster, assert) {
    var tchannelAsThrift = makeTChannelThriftServer(cluster, {
        okResponse: true
    });

    tchannelAsThrift.request({
        serviceName: 'server',
        hasNoParent: true
    }).send('Chamber::echo', null, {
        value: 10
    }, function onResponse(err, res) {
        assert.ifError(err);

        assert.ok(res.ok);
        assert.equal(res.headers.as, 'thrift');
        assert.equal(res.body, 10);
        assert.end();
    });
});

allocCluster.test('send and receive a not ok', {
    numPeers: 2
}, function t(cluster, assert) {
    var tchannelAsThrift = makeTChannelThriftServer(cluster, {
        notOkResponse: true
    });

    var client = cluster.channels[1].subChannels.server;

    tchannelAsThrift.send(client.request({
        serviceName: 'server',
        hasNoParent: true
    }), 'Chamber::echo', null, {
        value: 10
    }, function onResponse(err, res) {
        assert.ifError(err);

        assert.ok(!res.ok);

        assert.equal(res.body.value, 10);
        assert.equal(res.body.message, 'No echo');
        assert.equal(res.body.type, undefined);

        assert.end();
    });
});

allocCluster.test('send and receive a typed not ok', {
    numPeers: 2
}, function t(cluster, assert) {
    var tchannelAsThrift = makeTChannelThriftServer(cluster, {
        notOkTypedResponse: true
    });

    var client = cluster.channels[1].subChannels.server;

    tchannelAsThrift.send(client.request({
        serviceName: 'server',
        hasNoParent: true
    }), 'Chamber::echo', null, {
        value: 10
    }, function onResponse(err, res) {
        assert.ifError(err);

        assert.ok(!res.ok);

        assert.equal(res.body.value, 10);
        assert.equal(res.body.message, 'No echo typed error');
        assert.equal(res.body.type, 'server.no-echo');

        assert.end();
    });
});

allocCluster.test('sending and receiving headers', {
    numPeers: 2
}, function t(cluster, assert) {
    var tchannelAsThrift = makeTChannelThriftServer(cluster, {
        okResponse: true
    });

    var client = cluster.channels[1].subChannels.server;

    tchannelAsThrift.send(client.request({
        serviceName: 'server',
        hasNoParent: true
    }), 'Chamber::echo', {
        headerA: 'headerA',
        headerB: 'headerB'
    }, {
        value: 10
    }, function onResponse(err, res) {
        assert.ifError(err);

        assert.ok(res.ok);
        assert.deepEqual(res.head, {
            headerA: 'headerA',
            headerB: 'headerB'
        });
        assert.equal(res.body, 10);
        assert.end();
    });
});

allocCluster.test('getting an UnexpectedError frame', {
    numPeers: 2
}, function t(cluster, assert) {
    var tchannelAsThrift = makeTChannelThriftServer(cluster, {
        networkFailureResponse: true
    });
    var client = cluster.channels[1].subChannels.server;

    client.logger.whitelist(
        'error',
        'Got unexpected error in handler'
    );

    tchannelAsThrift.send(client.request({
        serviceName: 'server',
        hasNoParent: true
    }), 'Chamber::echo', null, {
        value: 10
    }, function onResponse(err, resp) {
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
    makeTChannelThriftServer(cluster, {
        networkFailureResponse: true
    });

    var client = cluster.channels[1].subChannels.server;

    client.request({
        serviceName: 'server',
        hasNoParent: true,
        timeout: 1500,
        headers: {
            as: 'thrift'
        }
    }).send('Chamber::echo', 'junk header', null, onResponse);

    function onResponse(err, resp) {
        assert.ok(err);

        assert.equal(err.isErrorFrame, true);
        assert.equal(err.codeName, 'BadRequest');
        assert.equal(err.message,
            'tchannel-thrift-handler.parse-error.head-failed: Could not ' +
                'parse head (arg2) argument.\n' +
                'Expected Thrift encoded arg2 for endpoint Chamber::echo.\n' +
                'Got junk heade instead of Thrift.\n' +
                'Parsing error was: ' +
                'expected at least 28267 bytes, only have 7 @[2:4].\n'
        );

        assert.equal(resp, null);

        assert.end();
    }
});

allocCluster.test('sending without as header', {
    numPeers: 2
}, function t(cluster, assert) {
    makeTChannelThriftServer(cluster, {
        networkFailureResponse: true
    });

    var client = cluster.channels[1].subChannels.server;

    client.request({
        serviceName: 'server',
        hasNoParent: true,
        headers: {
            as: 'lol'
        },
        timeout: 1500
    }).send('Chamber::echo', null, null, onResponse);

    function onResponse(err, resp) {
        assert.ok(err);

        assert.equal(err.isErrorFrame, true);
        assert.equal(err.codeName, 'BadRequest');
        assert.equal(err.message,
            'Expected call request as header to be thrift');

        assert.equal(resp, null);

        assert.end();
    }
});

allocCluster.test('logger set correctly in send and register functions', {
    numPeers: 2
}, function t(cluster, assert) {
    var tchannelAsThrift = makeTChannelThriftServer(cluster, {
        okResponse: true
    });
    var client = cluster.channels[1].subChannels.server;
    tchannelAsThrift.logger = undefined;

    function okHandler(opts, req, head, body, cb) {
        return cb(null, {
            ok: true,
            head: head,
            body: body.value
        });
    }

    tchannelAsThrift.register(client, 'Chamber::echo', {
        value: 10
    }, okHandler);
    assert.equal(tchannelAsThrift.logger, client.logger);

    var request = client.request({
        serviceName: 'server',
        hasNoParent: true
    });

    tchannelAsThrift.logger = undefined;
    tchannelAsThrift.send(request, 'Chamber::echo', null, {
        value: 10
    }, function onResponse(err, res) {
        assert.ifError(err);
        assert.equal(tchannelAsThrift.logger, request.channel.logger);
        assert.end();
    });
});

allocCluster.test('send with invalid types', {
    numPeers: 2
}, function t(cluster, assert) {
    makeTChannelThriftServer(cluster, {
        okResponse: true
    });

    var client = cluster.channels[1].subChannels.server;
    var tchannelAsThrift = client.TChannelAsThrift({
        source: badThriftText
    });

    tchannelAsThrift.send(client.request({
        serviceName: 'server',
        hasNoParent: true
    }), 'Chamber::echo', null, {
        value: 'lol'
    }, function onResponse(err, res) {
        assert.ok(err);

        assert.equal(err.type, 'tchannel.bad-request');
        assert.equal(err.isErrorFrame, true);
        assert.equal(err.codeName, 'BadRequest');
        assert.equal(err.message,
            'tchannel-thrift-handler.parse-error.body-failed: ' +
                'Could not parse body (arg3) argument.\n' +
                'Expected Thrift encoded arg3 for endpoint Chamber::echo.\n' +
                'Got \u000b\u0000\u0001\u0000\u0000\u0000\u0003lol ' +
                'instead of Thrift.\n' +
                'Parsing error was: ' +
                'unexpected typeid 11 (STRING) for field "value" ' +
                'with id 1 on echo_args; expected 8 (I32).\n'
        );

        assert.equal(res, undefined);

        assert.end();
    });
});

function makeTChannelThriftServer(cluster, opts) {
    var server = cluster.channels[0].makeSubChannel({
        serviceName: 'server'
    });
    var NoEchoTypedError = TypedError({
        type: 'server.no-echo',
        message: 'No echo typed error',
        value: null
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

    var fn = opts.okResponse ? okHandler :
        opts.notOkResponse ? notOkHandler :
        opts.notOkTypedResponse ? notOkTypedHandler :
        opts.networkFailureResponse ? networkFailureHandler :
            networkFailureHandler;

    var tchannelAsThrift = cluster.channels[0].TChannelAsThrift({
        source: opts.thriftText || globalThriftText,
        logParseFailures: false,
        channel: cluster.channels[1].subChannels.server
    });
    tchannelAsThrift.register(server, 'Chamber::echo', options, fn);
    tchannelAsThrift.register(server, 'Chamber::echo_big', options, echoBig);

    return tchannelAsThrift;

    function echoBig(opts, req, head, body, cb) {
        return cb(null, {
            ok: true,
            head: null,
            body: body.value.length
        });
    }

    function okHandler(opts, req, head, body, cb) {
        return cb(null, {
            ok: true,
            head: head,
            body: body.value
        });
    }

    function notOkHandler(opts, req, head, body, cb) {
        return cb(null, {
            ok: false,
            body: NoEchoError(body.value),
            typeName: 'noEcho'
        });
    }

    function notOkTypedHandler(opts, req, head, body, cb) {
        cb(null, {
            ok: false,
            body: NoEchoTypedError({
                value: body.value
            }),
            typeName: 'noEchoTyped'
        });
    }

    function networkFailureHandler(opts, req, head, body, cb) {
        var networkError = new Error('network failure');

        cb(networkError);
    }

    function NoEchoError(value) {
        var err = new Error('No echo');
        err.value = value;
        return err;
    }
}
