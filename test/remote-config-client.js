'use strict';

var test = require('tape');

var remoteConfigFile = require('./lib/remote-config-file.js')();
var setTimeout = require('timers').setTimeout;

test('creating a RemoteConfig', function t(assert) {
    remoteConfigFile.clear();
    var config = remoteConfigFile.create();
    config.loadSync();

    assert.equal(config.get('unknown', '~na~'), '~na~');

    assert.end();
});

test('will fetch config file', function t(assert) {
    var config = remoteConfigFile.create();

    remoteConfigFile.write({
        'foo': 'bar'
    });

    config.loadSync();
    assert.equal(config.get('foo', '~na~'), 'bar');
    assert.end();
});

test('will allow namespaces', function t(assert) {
    var config = remoteConfigFile.create();

    remoteConfigFile.write({
        'foo.bar.baz': 'bar'
    });

    config.loadSync();
    assert.equal(config.get('foo.bar.baz', '~na~'), 'bar');
    assert.end();
});

test('will update on starting up', function t(assert) {
    remoteConfigFile.clear();
    var config = remoteConfigFile.create({
        pollInterval: 5
    });

    var updated;
    config.on('change:foo', function onUpdate() {
        assert.equals(config.get('foo', '~na~'), 'bar', 'property should have been updated');
        updated = true;
    });

    remoteConfigFile.write({
        'foo': 'bar'
    });

    config.startPolling();
    setTimeout(check, 20);
    function check() {
        assert.ok(updated, 'the update event should have been emitted');
        config.destroy();
        assert.end();
    }
});

test('will alert on property change', function t(assert) {
    remoteConfigFile.clear();
    var config = remoteConfigFile.create({
        pollInterval: 5
    });
    var before = config.get('foo', '~na~');
    var updated;
    config.on('change:foo', function onUpdate() {
        assert.notEquals(before, config.get('foo', '~na~'), 'property should have been updated');
        updated = true;
    });
    config.startPolling();
    remoteConfigFile.write({
        'foo': 'baz'
    });

    setTimeout(check, 20);
    function check() {
        assert.ok(updated, 'the update event should have been emitted');
        config.destroy();
        assert.end();
    }
});
