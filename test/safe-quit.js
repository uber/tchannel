'use strict';

var test = require('tape');

var TChannel = require('../index.js');

test('can call quit() safely async', function t(assert) {
    var channel = TChannel({
        host: 'localhost',
        port: randomPort()
    });

    channel.once('listening', function onListen() {
        assert.doesNotThrow(function noThrow() {
            channel.quit();
        });

        assert.end();
    });
});

test('can call quit() safely sync', function t(assert) {
    var channel = TChannel({
        host: 'localhost',
        port: randomPort()
    });

    assert.doesNotThrow(function noThrow() {
        channel.quit();
    });
    assert.end();
});

function randomPort() {
    return 20000 + Math.floor(Math.random() * 20000);
}
