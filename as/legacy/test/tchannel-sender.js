'use strict';

var test = require('tape');
var NullLogtron = require('null-logtron');

var jsonSender = require('../tchannel-json-sender.js');

test('sending stuff', function t(assert) {
    var tclient = jsonSender({
        logger: NullLogtron(),
        tchannel: {
            request: function request() {
                return {
                    send: send
                };

                function send() {
                    var cb = arguments[arguments.length - 1];
                    cb(null, {ok: true}, '"hi"', '"bye"');
                }
            }
        }
    });

    tclient.send({
        hostPort: 'host:port',
        service: 'wat',
        endpoint: 'foo',
        head: null,
        body: null,
        timeout: 5000
    }, function onResults(err, resp) {
        assert.ifError(err);

        assert.equal(resp.head, 'hi');
        assert.equal(resp.body, 'bye');

        assert.end();
    });
});

test('sending errors', function t(assert) {
    var tclient = jsonSender({
        logger: NullLogtron(),
        tchannel: {
            request: function request() {
                return {
                    send: send
                };

                function send() {
                    var cb = arguments[arguments.length - 1];

                    cb(new Error('oh hi'));
                }
            }
        }
    });

    tclient.send({
        hostPort: 'host:port',
        service: 'wat',
        endpoint: 'foo',
        head: null,
        body: null,
        timeout: 5000
    }, function onResults(err, resp) {
        assert.equal(err.message, 'oh hi');

        assert.end();
    });
});

test('sending tchannel error', function t(assert) {
    var tclient = jsonSender({
        logger: NullLogtron(),
        tchannel: {
            request: function request() {
                return {
                    send: send
                };

                function send() {
                    var cb = arguments[arguments.length - 1];
                    cb(null, {ok: false}, '', '{"message":"oh hi"}');
                }
            }
        }
    });

    tclient.send({
        hostPort: 'host:port',
        service: 'wat',
        endpoint: 'foo',
        head: null,
        body: null,
        timeout: 5000
    }, function onResults(err, resp) {
        assert.equal(err.message, 'oh hi');

        assert.end();
    });
});
