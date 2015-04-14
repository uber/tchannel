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

var test = require('tape');
var Buffer = require('buffer').Buffer;
var NullLogtron = require('null-logtron');

var tchannelHandler = require('../tchannel-json-handler.js');

var hostInfo = 'localhost:4000';
var options = {
    clients: {
        logger: NullLogtron()
    }
};

test('handling empty arg2', function t(assert) {
    var endpoint = tchannelHandler(function h(inc, opts, cb) {
        cb(null, {
            head: null,
            body: inc
        });
    }, 'endpoint', options);

    endpoint({
        service: 'wat',
        arg1: 'foo',
        arg2: new Buffer(''),
        arg3: new Buffer(''),
        remoteAddr: hostInfo
    }, {
        sendOk: sendOk
    });

    function sendOk(res1, res2) {
        assert.equal(res1, 'null');

        var value = JSON.parse(res2);
        assert.equal(value.head, null);
        assert.equal(value.body, null);
        assert.equal(value.hostInfo, hostInfo);
        assert.equal(value.service, 'wat');
        assert.equal(value.endpoint, 'foo');

        assert.end();
    }
});

test('handling object arg2', function t(assert) {
    var endpoint = tchannelHandler(function h(inc, opts, cb) {
        cb(null, {
            head: null,
            body: inc
        });
    }, 'endpoint', options);

    endpoint({
        service: 'wat',
        endpoint: 'foo',
        head: new Buffer(JSON.stringify({
            some: 'object'
        })),
        body: new Buffer(''),
        hostInfo: hostInfo
    }, {
        sendOk: sendOk
    });

    function sendOk(err, res1, res2) {
        assert.ifError(err);

        assert.equal(typeof res1, 'string');

        var value = JSON.parse(res2);
        assert.deepEqual(value.head, {
            some: 'object'
        });

        assert.end();
    }
});

test('handling invalid json arg2', function t(assert) {
    var endpoint = tchannelHandler(function h(inc, opts, cb) {
        cb(null, {
            head: null,
            body: inc
        });
    }, 'endpoint', options);

    endpoint({
        service: 'wat',
        endpoint: 'foo',
        head: new Buffer('undefined'),
        body: new Buffer(''),
        hostInfo: hostInfo
    }, {
        sendOk: sendOk
    });

    function sendOk(err, res1, res2) {
        assert.ok(err);

        assert.equal(err.type,
            'tchannel-handler.parse-error.head-failed');
        assert.equal(err.statusCode, 400);
        assert.equal(err.name, 'endpoint');

        assert.end();
    }
});

test('handling empty arg3', function t(assert) {
    var endpoint = tchannelHandler(function h(inc, opts, cb) {
        cb(null, {
            head: null,
            body: inc
        });
    }, 'endpoint', options);

    endpoint({
        service: 'wat',
        endpoint: 'foo',
        head: new Buffer(''),
        body: new Buffer(''),
        hostInfo: hostInfo
    }, {
        sendOk: sendOk
    });

    function sendOk(err, res1, res2) {
        assert.ifError(err);

        assert.equal(typeof res1, 'string');

        var value = JSON.parse(res2);
        assert.equal(value.body, null);

        assert.end();
    }
});

test('handling object arg3', function t(assert) {
    var endpoint = tchannelHandler(function h(inc, opts, cb) {
        cb(null, {
            head: null,
            body: inc
        });
    }, 'endpoint', options);

    endpoint({
        service: 'wat',
        endpoint: 'foo',
        head: new Buffer(''),
        body: new Buffer(JSON.stringify({
            some: 'object'
        })),
        hostInfo: hostInfo
    }, {
        sendOk: sendOk
    });

    function sendOk(err, res1, res2) {
        assert.ifError(err);

        assert.equal(typeof res1, 'string');

        var value = JSON.parse(res2);
        assert.deepEqual(value.body, {
            some: 'object'
        });

        assert.end();
    }
});

test('handling invalid json arg3', function t(assert) {
    var endpoint = tchannelHandler(function h(inc, opts, cb) {
        cb(null, {
            head: null,
            body: inc
        });
    }, 'endpoint', options);

    endpoint({
        service: 'wat',
        endpoint: 'foo',
        head: new Buffer(''),
        body: new Buffer('undefined'),
        hostInfo: hostInfo
    }, {
        sendOk: sendOk
    });

    function sendOk(err, res1, res2) {
        assert.ok(err);

        assert.equal(err.type,
            'tchannel-handler.parse-error.body-failed');
        assert.equal(err.statusCode, 400);
        assert.equal(err.name, 'endpoint');

        assert.end();
    }
});

test('handler function gets options', function t(assert) {
    var counter = 0;

    var endpoint = tchannelHandler(function h(inc, opts, cb) {
        counter++;

        assert.equal(opts, options);

        cb(null, {
            head: null,
            body: null
        });
    }, 'endpoint', options);

    endpoint({
        service: 'wat',
        endpoint: 'foo',
        head: new Buffer(''),
        body: new Buffer(''),
        hostInfo: hostInfo
    }, {
        sendOk: sendOk
    });

    function sendOk(err, res1, res2) {
        assert.ifError(err);

        assert.equal(typeof res1, 'string');
        assert.equal(typeof res2, 'string');

        assert.equal(counter, 1);

        assert.end();
    }
});

test('handler function that errors', function t(assert) {
    var endpoint = tchannelHandler(function h(inc, opts, cb) {
        cb(new Error('oops'));
    }, 'endpoint', options);

    endpoint({
        service: 'wat',
        endpoint: 'foo',
        head: new Buffer(''),
        body: new Buffer(''),
        hostInfo: hostInfo
    }, {
        sendOk: sendOk
    });

    function sendOk(err, res1, res2) {
        assert.ok(err);
        assert.equal(err.message, 'oops');

        assert.end();
    }
});

test('handler function gets incoming', function t(assert) {
    var counter = 0;
    var endpoint = tchannelHandler(function h(inc, opts, cb) {
        counter++;

        assert.deepEqual(inc.head, {
            head: true
        });
        assert.deepEqual(inc.body, {
            body: true
        });
        assert.equal(inc.hostInfo, 'localhost:8000');

        cb(null, {
            head: null,
            body: null
        });
    }, 'endpoint', options);

    endpoint({
        service: 'wat',
        endpoint: 'foo',
        head: new Buffer(JSON.stringify({
            head: true
        })),
        body: new Buffer(JSON.stringify({
            body: true
        })),
        hostPort: 'localhost:8000'
    }, {
        sendOk: sendOk
    });

    function sendOk(err, res1, res2) {
        assert.ifError(err);

        assert.equal(typeof res1, 'string');
        assert.equal(typeof res2, 'string');
        assert.equal(counter, 1);

        assert.end();
    }
});

test('handling json res1', function t(assert) {
    var endpoint = tchannelHandler(function h(inc, opts, cb) {
        cb(null, {
            head: {
                some: 'head'
            },
            body: null
        });
    }, 'endpoint', options);

    endpoint({
        service: 'wat',
        endpoint: 'foo',
        head: new Buffer(''),
        body: new Buffer(''),
        hostInfo: hostInfo
    }, {
        sendOk: sendOk
    });

    function sendOk(err, res1, res2) {
        assert.ifError(err);

        assert.equal(typeof res1, 'string');
        assert.equal(typeof res2, 'string');

        var head = JSON.parse(res1);
        assert.deepEqual(head, {
            some: 'head'
        });

        assert.end();
    }
});

test('handling invalid json res1', function t(assert) {
    var endpoint = tchannelHandler(function h(inc, opts, cb) {
        var head = {};
        head.cyclic = head;
        cb(null, {
            head: head,
            body: null
        });
    }, 'endpoint', options);

    endpoint({
        service: 'wat',
        endpoint: 'foo',
        head: new Buffer(''),
        body: new Buffer(''),
        hostInfo: hostInfo
    }, {
        sendOk: sendOk
    });

    function sendOk(err, res1, res2) {
        assert.ok(err);
        assert.equal(err.type,
            'tchannel-handler.stringify-error.head-failed');
        assert.equal(err.statusCode, 500);
        assert.equal(err.name, 'endpoint');

        assert.end();
    }
});

test('handling json res2', function t(assert) {
    var endpoint = tchannelHandler(function h(inc, opts, cb) {
        cb(null, {
            head: null,
            body: {
                some: 'body'
            }
        });
    }, 'endpoint', options);

    endpoint({
        service: 'wat',
        endpoint: 'foo',
        head: new Buffer(''),
        body: new Buffer(''),
        hostInfo: hostInfo
    }, {
        sendOk: sendOk
    });

    function sendOk(err, res1, res2) {
        assert.ifError(err);

        assert.equal(typeof res1, 'string');
        assert.equal(typeof res2, 'string');

        var body = JSON.parse(res2);
        assert.deepEqual(body, {
            some: 'body'
        });

        assert.end();
    }
});

test('handling invalid json res2', function t(assert) {
    var endpoint = tchannelHandler(function h(inc, opts, cb) {
        var body = {};
        body.cyclic = body;
        cb(null, {
            head: null,
            body: body
        });
    }, 'endpoint', options);

    endpoint({
        service: 'wat',
        endpoint: 'foo',
        head: new Buffer(''),
        body: new Buffer(''),
        hostInfo: hostInfo
    }, {
        sendOk: sendOk
    });

    function sendOk(err, res1, res2) {
        assert.ok(err);
        assert.equal(err.type,
            'tchannel-handler.stringify-error.body-failed');
        assert.equal(err.statusCode, 500);
        assert.equal(err.name, 'endpoint');

        assert.end();
    }
});
