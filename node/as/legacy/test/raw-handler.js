'use strict';

var test = require('tape');
var Buffer = require('buffer').Buffer;
var NullLogtron = require('null-logtron');

var rawHandler = require('../tchannel-raw-handler.js');

var hostInfo = 'localhost:4000';

test('rawHandler result', function t(assert) {
    var options = {
        clients: {
            logger: NullLogtron()
        }
    };

    var h = rawHandler(successHandler, 'success', options);

    h({
        service: 'wat',
        arg1: 'wat',
        arg2: new Buffer('arg2'),
        arg3: new Buffer('arg3'),
        remoteAddr: hostInfo
    }, function mockBuildResponse() {
        return {
            sendOk: sendOk
        };
    });

    function successHandler(inc, opts, cb) {
        assert.deepEqual(inc, {
            service: 'wat',
            endpoint: 'wat',
            head: new Buffer('arg2'),
            body: new Buffer('arg3'),
            hostInfo: hostInfo
        });
        assert.equal(opts, options);

        cb(null, {
            head: new Buffer('res1'),
            body: new Buffer('res2')
        });
    }

    function sendOk(res1, res2) {
        assert.deepEqual(res1, new Buffer('res1'));
        assert.deepEqual(res2, new Buffer('res2'));

        assert.end();
    }
});

test('rawHandler error', function t(assert) {
    var options = {
        clients: {
            logger: NullLogtron()
        }
    };

    var h = rawHandler(successHandler, 'success', options);

    h({
        service: 'wat',
        arg1: 'wat',
        arg2: new Buffer('arg2'),
        arg3: new Buffer('arg3'),
        remoteAddr: hostInfo
    }, function mockBuildResponse() {
        return {
            sendNotOk: sendNotOk
        };
    });

    function successHandler(inc, opts, cb) {
        assert.deepEqual(inc, {
            service: 'wat',
            endpoint: 'wat',
            head: new Buffer('arg2'),
            body: new Buffer('arg3'),
            hostInfo: hostInfo
        });
        assert.equal(opts, options);

        cb(new Error('foo'));
    }

    function sendNotOk(res1, res2) {
        assert.equal(res1, null);
        assert.equal(res2, '{"message":"foo"}');

        assert.end();
    }
});
