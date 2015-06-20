'use strict';

var test = require('tape');
var TChannel = require('../../');

var HyperbahnClient = require('../../hyperbahn/index.js');

test('creating HyperbahnClient with new', function t(assert) {
    var c = new HyperbahnClient({
        tchannel: TChannel(),
        serviceName: 'foo',
        callerName: 'foo-test',
        hostPortList: []
    });

    assert.ok(c, 'can create a client');

    assert.end();
});

test('create HyperbahnClient without options', function t(assert) {
    assert.throws(function throwIt() {
        HyperbahnClient();
    }, /invalid option tchannel/);

    assert.end();
});

test('create HyperbahnClient without options.tchannel', function t(assert) {
    assert.throws(function throwIt() {
        HyperbahnClient({});
    }, /invalid option tchannel/);

    assert.end();
});

test('create HyperbahnClient with a subchannel', function t(assert) {
    assert.throws(function throwIt() {
        var tchannel = TChannel();

        HyperbahnClient({
            tchannel: tchannel.makeSubChannel({
                serviceName: 'foo'
            })
        });
    }, /invalid option tchannel/);

    assert.end();
});

test('create HyperbahnClient without serviceName', function t(assert) {
    assert.throws(function throwIt() {
        var tchannel = TChannel();

        HyperbahnClient({
            tchannel: tchannel
        });
    }, /invalid option serviceName/);

    assert.end();
});

test('create HyperbahnClient without hostPortList', function t(assert) {
    assert.throws(function throwIt() {
        var tchannel = TChannel();

        HyperbahnClient({
            tchannel: tchannel,
            serviceName: 'foo'
        });
    }, /invalid option hostPortList/);

    assert.end();
});
