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

var allocCluster = require('../lib/alloc-cluster');

allocCluster.test('get spans from outpeer', {
    numPeers: 2
}, function t(cluster, assert) {
    var one = cluster.channels[0];
    var two = cluster.channels[1];

    var traces = [];

    one.tracer.reporter = two.tracer.reporter = function r(span) {
        traces.push(span);
    };

    var twoSvc = two.makeSubChannel({
        serviceName: 'two'
    });
    twoSvc.register('echo', echo);

    var oneSvc = one.makeSubChannel({
        serviceName: 'one'
    });
    oneSvc.register('echo', echo);

    var oneToTwoClient = one.makeSubChannel({
        serviceName: 'two',
        peers: [two.hostPort],
        requestDefaults: {
            serviceName: 'two',
            headers: {
                as: 'raw',
                cn: 'one'
            }
        }
    });

    var twoToOneClient = two.makeSubChannel({
        serviceName: 'one',
        peers: [one.hostPort],
        requestDefaults: {
            serviceName: 'one',
            headers: {
                as: 'raw',
                cn: 'two'
            }
        }
    });


    oneToTwoClient.request({
        hasNoParent: true
    }).send('echo', 'foo', 'bar', function done(err, res, arg2, arg3) {
        assert.ifError(err, 'no unexpected error');
        assert.equal(String(arg2), 'foo', 'expected arg2');
        assert.equal(String(arg3), 'bar', 'expected arg3');

        twoToOneClient.request({
            hasNoParent: true,
            parent: res
        }).send('echo', 'foo', 'bar', function done(err, res, arg2, arg3) {
            assert.ifError(err, 'no unexpected error');

            assert.equal(traces.length, 4);
            checkMatching(assert, traces);

            traces.forEach(function (a) {
                traces.forEach(function (b) {
                    assert.deepEquals(a.traceid, b.traceid, 'all spans have same traceid');
                });

                assert.ok(a.binaryAnnotations.some(function (anno) {
                    return anno.key === 'as' && anno.value === 'raw';
                }), 'has as=raw annotation');
            });

            var oneSpans = traces.filter(function (item) {
                return item.annotations[0].host.serviceName === 'one';
            });

            var twoSpans = traces.filter(function (item) {
                return item.annotations[0].host.serviceName === 'two';
            });

            oneSpans.forEach(function (oneSpan) {
                twoSpans.forEach(function (twoSpan) {
                    assert.deepEquals(
                        oneSpan.parentid,
                        twoSpan.id,
                        'twoSpans are parents of oneSpans'
                    );
                });
            });

            oneSpans.forEach(function (oneSpan) {
                assert.ok(oneSpan.binaryAnnotations.some(function (anno) {
                    return anno.key === 'cn' && anno.value === 'two';
                }), 'each one span has cn=two annotation');
            });

            twoSpans.forEach(function (twoSpan) {
                assert.ok(twoSpan.binaryAnnotations.some(function (anno) {
                    return anno.key === 'cn' && anno.value === 'one';
                }), 'each two span has cn=one annotation');
            });

            var oneSr = oneSpans.filter(function (oneSpan) {
                return oneSpan.annotations.some(function (a) {
                    return a.value[0] === 's';
                });
            })[0];

            assert.ok(oneSr.binaryAnnotations.some(function (a) {
                return a.key === 'src' && a.value === two.hostPort;
            }), 'oneSr has src = two.hostPort');

            var twoSr = twoSpans.filter(function (twoSpan) {
                return twoSpan.annotations.some(function (a) {
                    return a.value[0] === 's';
                });
            })[0];

            assert.ok(twoSr.binaryAnnotations.some(function (a) {
                return a.key === 'src' && a.value === one.hostPort;
            }), 'twoSr has src = one.hostPort');

            assert.end();
        });
    });
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

    return spans.some(function (spanB) {
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
    spans.forEach(function (span) {
        assert.ok(findMatchingSpan(spans, span), "span has matching span: " +
            spanToString(span));
    });
}

function echo(req, res, arg2, arg3) {
    res.headers.as = 'raw';
    res.sendOk(arg2, arg3);
}

function spanToString(span) {
    var annotations = span.annotations.map(function (item) {
        return '[' + item.value + '@' + item.timestamp + ']';
    }).join(' ');

    var binaryAnnotations = span.binaryAnnotations.map(function (item) {
        return '[' + item.key + '=' + item.value + ']';
    }).join(' ');

    return ("SPAN: traceid: " + span.traceid.toString('base64') +
        ' spanid: ' + span.id.toString('base64') + ' parentid: ' +
        span.parentid.toString('base64') + ' ' + span.annotations[0].host.serviceName +
        " :: " + span.name + " port " + span.annotations[0].host.port + " " + annotations + " " +
        binaryAnnotations);
}

