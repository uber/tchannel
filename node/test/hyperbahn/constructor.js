'use strict';

var test = require('tape');
var TChannel = require('tchannel');

var AutobahnClient = require('../index.js');

test('creating AutobahnClient with new', function t(assert) {
    var c = new AutobahnClient({
        tchannel: TChannel(),
        serviceName: 'foo',
        callerName: 'foo-test',
        hostPortList: []
    });

    assert.ok(c, 'can create a client');

    assert.end();
});

test('create AutobahnClient without options', function t(assert) {
    assert.throws(function throwIt() {
        AutobahnClient();
    }, /invalid option tchannel/);

    assert.end();
});

test('create AutobahnClient without options.tchannel', function t(assert) {
    assert.throws(function throwIt() {
        AutobahnClient({});
    }, /invalid option tchannel/);

    assert.end();
});

test('create AutobahnClient with a subchannel', function t(assert) {
    assert.throws(function throwIt() {
        var tchannel = TChannel();

        AutobahnClient({
            tchannel: tchannel.makeSubChannel({
                serviceName: 'foo'
            })
        });
    }, /invalid option tchannel/);

    assert.end();
});

test('create AutobahnClient without serviceName', function t(assert) {
    assert.throws(function throwIt() {
        var tchannel = TChannel();

        AutobahnClient({
            tchannel: tchannel
        });
    }, /invalid option serviceName/);

    assert.end();
});

test('create AutobahnClient without hostPortList', function t(assert) {
    assert.throws(function throwIt() {
        var tchannel = TChannel();

        AutobahnClient({
            tchannel: tchannel,
            serviceName: 'foo'
        });
    }, /invalid option hostPortList/);

    assert.end();
});
