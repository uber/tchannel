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

var allocCluster = require('./lib/test-cluster');
var TCReporter = require('tchannel/tcollector/reporter');
var util = require('util');
var timers = require('timers');

allocCluster.test('tracer picks up advertise and forward', {
    size: 10,
    trace: true,
    remoteConfig: {
        'kValue.default': 3
    }
}, function t(cluster, assert) {
    var steve = cluster.remotes.steve;

    var dummy = cluster.dummies[0];

    var steveExits = cluster.apps[0].clients.egressNodes
        .exitsFor(steve.serviceName);

    var nonSteveExits = cluster.apps.filter(function isExit(someApp) {
        return !steveExits[someApp.tchannel.hostPort];
    }).map(function pluckHostPort(someApp) {
        return someApp.tchannel.hostPort;
    });

    var tcReporter = TCReporter({
        callerName: 'tcollector-dummy',
        logger: cluster.logger,
        channel: dummy.makeSubChannel({
            peers: cluster.hostPortList,
            serviceName: 'tcollector-client'
        })
    });

    dummy.tracer.reporter = function r(span) {
        tcReporter.report(span);
    };

    var clientChan = dummy.makeSubChannel({
        serviceName: steve.serviceName,
        peers: nonSteveExits
    });

    clientChan.request({
        serviceName: steve.serviceName,
        hasNoParent: true,
        headers: {
            as: 'raw',
            cn: 'dummyChan'
        }
    }).send('echo', null, JSON.stringify('asdf'), onForwarded);

    function onForwarded(err, res, arg2, arg3) {
        assert.ifError(err);

        /*eslint max-statements: [1, 30]*/
        timers.setTimeout(function onSpansReady() {
            var traces = cluster.tcollector.traces;

            // Ensures we have 2 span parts for each span; one with client
            // annotations and one with server annotations
            checkMatching(assert, cluster.tcollector.traces);

            // Check the top level echo spans

            var topSpans = findSpanPair(assert, traces, {
                parentId: 'AAAAAAAAAAA=',
                serviceName: 'steve'
            });

            assert.equals(
                topSpans.server.host.serviceName,
                topSpans.client.host.serviceName,
                'echo spans have matching service names'
            );

            var topEchoDest = '127.0.0.1:' +
                topSpans.server.host.port;

            assert.ok(
                topEchoDest,
                steve.channel.hostPort
            );

            // // Check the forwarding spans

            var echoForwardSpans = findSpan(traces, {
                parentId: topSpans.client.id.toString('base64')
            });

            assert.equal(echoForwardSpans.length, 0);

            // // Check ad spans

            var steveAdSpans = findSpan(traces, {
                cn: 'steve',
                serviceName: 'hyperbahn'
            });
            assert.equal(steveAdSpans.length, 0);

            assert.end();
        }, 100);
    }
});

function findSpanType(span) {
    if (span.annotations[0].value[0] === 'c') {
        return 'client';
    } else {
        return 'server';
    }
}

function findMatchingSpan(spans, spanA) {
    var spanAType = findSpanType(spanA);

    return spans.some(function e(spanB) {
        if (spanA.id.toString('base64') === spanB.id.toString('base64')) {
            if (spanAType === 'client') {
                return findSpanType(spanB) === 'server';
            } else {
                return findSpanType(spanB) === 'client';
            }
        }
    });
}

function checkMatching(assert, spans) {
    spans.forEach(function e(span) {
        assert.ok(findMatchingSpan(spans, span), 'span has matching span: ' +
            spanToString(span));
    });
}

function spanToString(span) {
    var annotations = span.annotations.map(function e(item) {
        return '[' + item.value + '@' + item.timestamp + ']';
    }).join(' ');

    var binaryAnnotations = span.binaryAnnotations.map(function e2(item) {
        return '[' + item.key + '=' + item.stringValue + ']';
    }).join(' ');

    return ('SPAN: traceid: ' + span.traceId.toString('base64') +
        ' spanid: ' + span.id.toString('base64') + ' parentid: ' +
        span.parentId.toString('base64') + ' ' + span.host.serviceName +
        ' :: ' + span.name + ' port ' + span.host.port + ' ' + annotations + ' ' + binaryAnnotations);
}

function findSpan(traces, props) {
    return traces.filter(function e(span) {
        if (props.type && findSpanType(span) !== props.type) {
            return false;
        }

        if (props.id && span.id.toString('base64') !== props.id) {
            return false;
        }

        if (
            props.parentId &&
            span.parentId.toString('base64') !== props.parentId
        ) {
            return false;
        }

        if (
            props.traceId &&
            span.traceId.toString('base64') !== props.traceId
        ) {
            return false;
        }

        if (props.serviceName && span.host.serviceName !== props.serviceName) {
            return false;
        }

        if (props.cn) {
            var matching = span.binaryAnnotations.filter(function e2(item) {
                return item.key === 'cn';
            });

            if (!matching || matching.length !== 1) {
                return false;
            }

            if (matching[0].stringValue !== props.cn) {
                return false;
            }
        }

        return true;
    });
}

function findSpanPair(assert, traces, props) {
    var spans = findSpan(traces, props);
    assert.equals(
        spans.length,
        2,
        'Expected to find 2 spans matching ' + util.inspect(props)
    );

    var serverSpan = findSpan(spans, {type: 'server'});
    var clientSpan = findSpan(spans, {type: 'client'});

    assert.equals(
        serverSpan.length,
        1,
        'Expected to find 1 server span matching ' + util.inspect(props)
    );

    assert.equals(
        clientSpan.length,
        1,
        'Expected to find 1 server span matching ' + util.inspect(props)
    );

    return {
        client: clientSpan[0],
        server: serverSpan[0]
    };
}

// function checkBinaryAnnotation(assert, span, key, value) {
//     var matching = span.binaryAnnotations.filter(function f(item) {
//         if (item.key === key) {
//             if (typeof value === 'number') {
//                 return item.doubleValue === value;
//             }

//             if (typeof value === 'string') {
//                 return item.stringValue === value;
//             }

//             if (typeof value === 'boolean') {
//                 return item.boolValue === value;
//             }
//         }
//     });

//     assert.equals(
//         matching.length,
//         1,
//         'expected to find one binary annotation matching key=' + key +
//             ' value=' + value
//     );
// }
