'use strict';

var test = require('tape');
var TChannel = require('../../');

var HyperbahnClient = require('../../hyperbahn/index.js');

test('getting client subChannel without serviceName', function t(assert) {
    var client = HyperbahnClient({
        tchannel: TChannel(),
        serviceName: 'foo',
        callerName: 'foo-test',
        hostPortList: []
    });

    assert.throws(function throwIt() {
        client.getClientChannel();
    }, /invalid option serviceName/);

    assert.throws(function throwIt() {
        client.getClientChannel({});
    }, /invalid option serviceName/);

    assert.end();
});

test('getting a client subChannel', function t(assert) {
    var client = HyperbahnClient({
        tchannel: TChannel(),
        serviceName: 'foo',
        callerName: 'foo-test',
        hostPortList: []
    });

    var subChannel = client.getClientChannel({
        serviceName: 'bar'
    });

    assert.equal(subChannel.topChannel, client.tchannel);

    assert.end();
});

test('double getting a client subChannel', function t(assert) {
    var client = HyperbahnClient({
        tchannel: TChannel(),
        serviceName: 'foo',
        callerName: 'foo-test',
        hostPortList: []
    });

    var subChannel1 = client.getClientChannel({
        serviceName: 'bar'
    });
    var subChannel2 = client.getClientChannel({
        serviceName: 'bar'
    });

    assert.equal(subChannel1, subChannel2);

    assert.end();
});
