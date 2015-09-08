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

var path = require('path');
var test = require('tape');
var fs = require('fs');
var Buffer = require('buffer').Buffer;
var timers = require('timers');
var thriftrw = require('thriftrw');

var allocCluster = require('./lib/alloc-cluster');

var TCollectorReporter = require('../tcollector/reporter');

var tcollectorSpec = fs.readFileSync(
    path.join(__dirname, '..', 'tcollector', 'tcollector.thrift'),
    'utf8'
);

test('test of thriftify spec', function t1(assert) {
    var thriftSpec = new thriftrw.Thrift({
        source: tcollectorSpec,
        strict: false
    });

    var argsType = thriftSpec.getType('TCollector::submit_args');

    var span = {span: {
        'name': '/top_level_endpoint',
        'traceId': new Buffer([
            235,
            53,
            247,
            224,
            123,
            217,
            117,
            13
        ]),
        'parentId': new Buffer([
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
        ]),
        'id': new Buffer([
            235,
            53,
            247,
            224,
            123,
            217,
            117,
            13
            ]),
        'annotations': [
            {
                'timestamp': 1433550363891,
                'value': 'cs'
            },
            {
                'timestamp': 1433550363944,
                'value': 'cr'
            }
        ],
        'host': {
            'ipv4': 2130706433,
            'port': 9999,
            'serviceName': 'server'
        },
        'binaryAnnotations': [
            {
                'key': 'foo',
                'annotationType': 'STRING',
                'stringValue': 'bar'
            }
        ]
    }};

    var res = argsType.toBufferResult(span);

    assert.ifErr(res.err);

    var res2 = argsType.fromBufferResult(res.value);

    assert.ifErr(res2.err);

    assert.deepEqual(res2.value.span.host, span.span.host);
    assert.deepEqual(res2.value.span.id, span.span.id);
    assert.deepEqual(res2.value.span.traceId, span.span.traceId);
    assert.deepEqual(res2.value.span.parentId, span.span.parentId);

    res2.value.span.annotations.forEach(function e1(actual) {
        assert.ok(span.span.annotations.some(function e2(expected) {
            return expected.timestamp === actual.timestamp &&
                expected.value === actual.value;
        }));
    });

    res2.value.span.binaryAnnotations.forEach(function e1(actual) {
        assert.ok(span.span.binaryAnnotations.some(function e2(expected) {
            return expected.key === actual.key &&
                expected.annotationType === actual.annotationType &&
                expected.stringValue === actual.stringValue;
        }));
    });

    assert.end();
});

var host = {ipv4: '192.168.0.1', port: 999, serviceName: 'foobar'};
var testSpan = {
    annotations: [
        {host: host, value: 'cs', timestamp: 100},
        {host: host, value: 'cr', timestamp: 200}
    ],
    binaryAnnotations: [
        {key: 'name', value: 'jake', type: 'string'},
        {key: 'count', value: 10, type: 'number'},
        {key: 'cacheHit', value: false, type: 'boolean'}
    ],
    traceid: new Buffer([0, 1, 2, 3, 4, 5, 6, 7]),
    parentid: new Buffer([2, 1, 2, 3, 4, 5, 6, 7]),
    id: new Buffer([0, 9, 2, 3, 4, 5, 6, 7]),
    name: 'testlol'
};

test('jsonSpanToThriftSpan', function t2(assert) {
    var mapped = TCollectorReporter.jsonSpanToThriftSpan(testSpan);

    assert.equals(mapped.name, testSpan.name);
    assert.deepEquals(mapped.traceId, testSpan.traceid);
    assert.deepEquals(mapped.id, testSpan.id);
    assert.deepEquals(mapped.parentId, testSpan.parentid);

    assert.deepEquals(mapped.host, {
        port: 999,
        serviceName: 'foobar',
        ipv4: -1062731775
    });

    mapped.annotations.forEach(function e(actual) {
        assert.ok(testSpan.annotations.some(function e2(expected) {
            return actual.value === expected.value &&
                actual.timestamp === expected.timestamp;
        }));
    });

    mapped.binaryAnnotations.forEach(function e(actual) {
        assert.ok(testSpan.binaryAnnotations.some(function e2(expected) {
            if (actual.key !== expected.key) {
                return false;
            } else if (actual.annotationType === 'STRING') {
                return actual.stringValue === expected.value;
            } else if (actual.annotationType === 'DOUBLE') {
                return actual.doubleValue === expected.value;
            } else if (actual.annotationType === 'BOOL') {
                return actual.boolValue === expected.value;
            }
        }));
    });

    assert.end();
});

allocCluster.test('functional test', {
    numPeers: 2,
}, function t3(cluster, assert) {
    var clientTChannel = cluster.channels[0];

    var serverTChannel = cluster.channels[1];

    var tcClientSubchan = clientTChannel.makeSubChannel({
        peers: [serverTChannel.hostPort],
        serviceName: 'tcollector'
    });

    var tcServerSubchan = serverTChannel.makeSubChannel({
        serviceName: 'tcollector'
    });

    var reporter = TCollectorReporter({
        logger: cluster.logger,
        channel: tcClientSubchan,
        callerName: 'tc-reporter'
    });

    var thrift = new serverTChannel.TChannelAsThrift({
        source: tcollectorSpec,
        strict: false
    });

    thrift.register(
        tcServerSubchan,
        'TCollector::submit',
        {},
        onSubmit
    );

    reporter.report(testSpan);

    function onSubmit(opts, req, head, body, done) {
        assert.equals(
            req.headers.shardKey,
            testSpan.traceid.toString('base64')
        );

        assert.equals(
            req.headers.shardKey,
            body.span.traceId.toString('base64')
        );

        assert.deepEqual(body.span.id, testSpan.id);
        assert.equals(body.span.host.ipv4, -1062731775);
        assert.equals(body.span.annotations.length, 2);

        done(null, {ok: true, body: {ok: true}});

        timers.setTimeout(function n() {
            clientTChannel.close();
            serverTChannel.close();
            assert.end();
        }, 5);
    }
});
