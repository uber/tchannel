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
var TChannel = require('../../');
var DebugLogtron = require('debug-logtron');

var HyperbahnClient = require('../../hyperbahn/index.js');

test('creating HyperbahnClient with new', function t(assert) {
    var logger = DebugLogtron('hyperbahnclient');

    var c = new HyperbahnClient({
        tchannel: TChannel({
            logger: logger
        }),
        serviceName: 'foo',
        callerName: 'foo-test',
        hostPortList: [],
        logger: logger
    });

    assert.ok(c, 'can create a client');

    c.tchannel.close();
    assert.end();
});

test('create HyperbahnClient without options', function t(assert) {
    assert.throws(function throwIt() {
        HyperbahnClient();
    }, /Must pass in top level tchannel/);

    assert.end();
});

test('create HyperbahnClient without options.tchannel', function t(assert) {
    assert.throws(function throwIt() {
        HyperbahnClient({});
    }, /Must pass in top level tchannel/);

    assert.end();
});

test('create HyperbahnClient with a subchannel', function t(assert) {
    var tchannel = TChannel();
    assert.throws(function throwIt() {
        HyperbahnClient({
            tchannel: tchannel.makeSubChannel({
                serviceName: 'foo'
            })
        });
    }, /Must pass in top level tchannel/);

    tchannel.close();
    assert.end();
});

test('create HyperbahnClient without serviceName', function t(assert) {
    var tchannel = TChannel();
    assert.throws(function throwIt() {
        HyperbahnClient({
            tchannel: tchannel
        });
    }, /must pass in serviceName/);

    tchannel.close();
    assert.end();
});

test('create HyperbahnClient without hostPortList', function t(assert) {
    var tchannel = TChannel();
    assert.throws(function throwIt() {
        HyperbahnClient({
            tchannel: tchannel,
            serviceName: 'foo'
        });
    }, /Must pass in hostPortList as array or hostPortFile as string/);

    tchannel.close();
    assert.end();
});

test('create HyperbahnClient with bad hostPortFile', function t(assert) {
    var tchannel = TChannel();
    assert.throws(function throwIt() {
        HyperbahnClient({
            tchannel: tchannel,
            serviceName: 'foo',
            hostPortFile: '~~~~~'
        });
    }, /Read host port list failed with Error: ENOENT, no such file or directory \'~~~~~\'/);

    tchannel.close();
    assert.end();
});
