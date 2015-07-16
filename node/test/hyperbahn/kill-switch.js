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

var EventEmitter = require('../../lib/event_emitter.js');
var test = require('tape');
var TChannel = require('../../');
var ServiceProxy = require('../../hyperbahn/service_proxy.js');

test('set cn/service', function t(assert) {

    var egress = new EventEmitter();
    egress.membershipChangedEvent = egress.defineEvent('membershipChanged');
    var proxy = new ServiceProxy({
        channel: TChannel(),
        egressNodes: egress
    });
    assert.equals(proxy.blockingTable, undefined, 'blocking table should be undefined');
    proxy.block('client1', 'service1');
    proxy.block('client1', 'service2');
    proxy.block('client2', 'service1');
    proxy.block('*', 'service1');
    proxy.block(null, 'service2');

    assert.ok(proxy.isBlocked('client1', 'service1'), 'set blocking client1/service1 correctly');
    assert.ok(proxy.isBlocked('client1', 'service2'), 'set blocking client1/service2 correctly');
    assert.ok(proxy.isBlocked('client2', 'service1'), 'set blocking client2/service1 correctly');
    assert.ok(proxy.isBlocked('*', 'service1'), 'set blocking */service1 correctly');
    assert.ok(proxy.isBlocked('*', 'service2'), 'set blocking */service2 correctly');
    assert.notOk(proxy.isBlocked('*', 'service3'), 'shouldn\'t have set */service3');
    assert.notOk(proxy.isBlocked('c', 's'), 'shouldn\'t have set c/s');

    proxy.destroy();
    proxy.channel.close();
    assert.end();
});

test('clear cn/service', function t(assert) {

    var egress = new EventEmitter();
    egress.membershipChangedEvent = egress.defineEvent('membershipChanged');
    var proxy = new ServiceProxy({
        channel: TChannel(),
        egressNodes: egress
    });
    assert.equals(proxy.blockingTable, undefined, 'blocking table should be undefined');
    proxy.block('client1', 'service1');
    proxy.block('client1', 'service2');
    proxy.block('client2', 'service1');
    proxy.block('*', 'service1');
    proxy.block(null, 'service2');

    proxy.unblock('client1', 'service1');
    proxy.unblock('client2', 'service1');
    proxy.unblock('*', 'service1');

    assert.notOk(proxy.isBlocked('client1', 'service1'), 'client1/service1 should be cleared');
    assert.notOk(proxy.isBlocked('client2', 'service1'), 'client2/service1  should be cleared');
    assert.notOk(proxy.isBlocked('*', 'service1'), '*/service1  should be cleared');

    assert.ok(proxy.isBlocked('client1', 'service2'), 'client1/service2 shouldn\'t be cleared');
    assert.ok(proxy.isBlocked('*', 'service2'), 'blocking */service2 shouldn\'t be cleared');

    proxy.unblock('client1', 'service2');
    proxy.unblock(null, 'service2');
    assert.notOk(proxy.isBlocked('client1', 'service2'), 'client1/service2 should be cleared');
    assert.notOk(proxy.isBlocked('*', 'service2'), 'blocking */service2 should be cleared');
    assert.equals(proxy.blockingTable, null, 'blocking table should be cleared');

    proxy.destroy();
    proxy.channel.close();
    assert.end();
});
