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

/*
 * HOWDO:
 *
 * This test tests argstream by exhaustive search.
 *
 * For speed concerns, it's set to only run the integration test which is
 * sufficient to catch regressions.
 *
 * However, since you're reading this, you'll probably want to instead change
 * it to run the unit tests to help understand which side the failure is on.
 *
 * If you doubt the exhaustive or correct nature of the search, you may be
 * served by running the sanity test to iterate on the searcher itself.
 */

var extend = require('xtend');
var test = require('tape');
var util = require('util');

var TestSearch = require('./lib/test_search');
var argstream = require('../argstream');

/* jshint camelcase:false */

// Useful for verifying the searcher
test.skip('setup sanity', argSearchTest(function t(state, assert) {
    var frames = state.frames;
    var args = state.args;

    // should only combine to 3 args
    assert.equal(args.length, 3);

    // shouldn't have any duplicate letters
    var counts = chrCounts(frames.map(function each(frame) {
        return frame.join('');
    }).join(''));
    var ks = Object.keys(counts);
    for (var i = 0; i < ks.length; i++) {
        if (counts[ks[i]] > 1) {
            assert.fail(util.format('bad test state', state));
            break;
        }
    }

    assert.end();
}));

test('argstream', function t(assert) {
    var first = true; // stop on first failure
    var verbose = false;
    if (module === require.main) {
        var argv = require('minimist', {
            boolean: {
                verbose: true
            }
        })(process.argv.slice(2));
        verbose = argv.verbose;
    }

    assert.test('unit test OutArgStream', {skip: !verbose}, argSearchTest({
        first: first
    }, function t(state, assert) {
        var frames = state.frames;
        var expect = realFrames(frames);
        var gotI = 0;
        var s = new argstream.OutArgStream();
        s.on('frame', function onFrame(tup) {
            var parts = tup[0];
            var expected = expect[gotI++];
            if (!expected) {
                assert.fail(util.format('unexpected frame %s: ', gotI, parts));
            } else {
                assert.deepEqual(parts, expected.map(function(part) {
                    return new Buffer(part);
                }), 'expected frame ' + gotI);
            }
        });
        s.on('finish', function onFinish() {
            assert.equal(gotI, expect.length, 'got all expected frames');
        });
        writeFrames(frames, s, assert.end);
    }));

    assert.test('unit test InArgStream', {skip: !verbose}, argSearchTest({
        first: first
    }, function t(state, assert) {
        var frames = state.frames;
        var args = state.args;
        var s = new argstream.InArgStream();
        hookupEnd(s, finish);
        realFrames(frames).forEach(function eachFrame(parts, i, frames) {
            s.handleFrame(parts, i === (frames.length - 1));
        });
        function finish(err) {
            assert.ifError(err, 'no end error');
            assert.equal(getArg(s.arg2), args[0] || null, 'expected arg2');
            assert.equal(getArg(s.arg3), args[1] || null, 'expected arg3');
            assert.end();
        }
    }));

    assert.test('integration test {Out -> In}ArgStream', {skip: verbose}, argSearchTest({
        first: first
    }, function t(state, assert) {
        var frames = state.frames;
        var args = state.args;
        var o = new argstream.OutArgStream();
        var i = new argstream.InArgStream();
        var lastParts = null;
        o.on('frame', function onFrame(tup) {
            var parts = tup[0];
            if (lastParts) {
                i.handleFrame(lastParts, false);
            }
            lastParts = parts;
        });
        writeFrames(frames, o, finish);
        function finish(err) {
            assert.ifError(err, 'no end error');
            i.handleFrame(lastParts || [], true);
            assert.equal(getArg(i.arg2), args[0] || null, 'expected arg2');
            assert.equal(getArg(i.arg3), args[1] || null, 'expected arg3');
            assert.end();
        }
    }));
});

function argSearchTest(options, testFunc) {
    if (typeof options === 'function') {
        testFunc = options;
        options = {};
    }

    var search = TestSearch(extend(options, {
        describeState: function describe(state) {
            return state.frames.map(function each(frame) {
                return frame.join('.');
            }).join('_');
        },

        init: function init() {
            var self = this;
            self.frontier.push({
                frames: [['', '']]
            });
        },

        test: function test(state, assert) {
            var self = this;
            var frames = state.frames;

            var args = state.args = [];
            var i = 0;
            args[i] = '';
            for (var j = 0; j < frames.length; j++) {
                var frame = frames[j];
                for (var k = 0; k < frame.length; k++) {
                    if (k > 0) args[++i] = '';
                    args[i] += frame[k];
                }
            }

            testFunc.call(self, state, assert);
        },

        next: function next(state, _emit) {
            var layers = [
                addPauses,
                addContent,
            ];
            gen(state.frames, 0, emit);

            function gen(frames, i, emit) {
                if (i < layers.length) {
                    layers[i](frames, function(frames) {
                        if (filter(frames)) {
                            gen(frames, i+1, emit);
                        }
                    });
                } else if (filter(frames)) {
                    emit(frames);
                }
            }

            function emit(frames) {
                _emit({frames: relabel(frames)});
            }
        }
    }));
    return search.run.bind(search);
}

function realFrames(frames) {
    return frames.filter(function(frame) {
        if (!frame.length) return false;
        if (frame.length === 1 && !frame[0].length) return false;
        return true;
    });
}

function writeFrames(frames, s, callback) {
    hookupEnd(s, callback);
    var writingArg = 2;
    eachFrame(0);
    function eachFrame(i) {
        var stream = s['arg' + writingArg];
        if (i >= frames.length) {
            if (stream) stream.end();
            return;
        }
        var frame = frames[i];
        if (!stream) return callback(new Error('ran out of arg streams'));
        for (var j = 0; j < frame.length; j++) {
            if (j > 0) {
                stream.end();
                stream = s['arg' + (++writingArg)];
                if (!stream) return callback(new Error('ran out of arg streams'));
            }
            if (j === frame.length - 1 && i === frames.length - 1) {
                stream.end(frame[j]);
                writingArg++;
            } else {
                stream.write(frame[j]);
            }
        }
        setImmediate(eachFrame, i+1);
    }
}

function chrCounts(s) {
    var counts = {};
    s.split('').forEach(function(chr) {
        counts[chr] = (counts[chr] || 0) + 1;
    });
    return counts;
}

function addPauses(frames, emit) {
    for (var i = 0; i<frames.length; i++) {
        var head = frames.slice(0, i);
        var tail = frames.slice(i + 1);
        var frame = frames[i];
        for (var j = 0; j<frame.length; j++) {
            var a = frame.slice(0, j);
            var b = frame.slice(j);
            if (a.length && b.length) {
                emit(head.concat([a.concat(['']), b]).concat(tail));
                emit(head.concat([a, [''].concat(b)]).concat(tail));
            } else if (a.length || b.length) {
                emit(head.concat([a, b]).concat(tail));
            }
        }
    }
}

function addContent(frames, emit) {
    var chr = greatestChr(frames);
    for (var i = 0; i < frames.length; i++) {
        var head = frames.slice(0, i);
        var tail = frames.slice(i + 1);
        var frame = frames[i];
        for (var j = 0; j < frame.length; j++) {
            if (!frame[j].length) {
                var part = frame.slice(0, j)
                    .concat([String.fromCharCode(chr)])
                    .concat(frame.slice(j+1));
                emit(head.concat([part]).concat(tail));
            }
        }
    }
}

function greatestChr(frames) {
    var chr = 0x41;
    for (var i = 0; i<frames.length; i++) {
        var frame = frames[i];
        for (var j = 0; j<frame.length; j++) {
            if (frame[j].length) {
                chr = Math.max(chr, frame[j].charCodeAt(0) + 1);
            }
        }
    }
    return chr;
}

function relabel(frames) {
    var chr = 0x41;
    var ret = new Array(frames.length);
    for (var i = 0; i < frames.length; i++) {
        var frame = frames[i];
        ret[i] = new Array(frame.length);
        for (var j = 0; j < frame.length; j++) {
            ret[i][j] = frame[j].length ? String.fromCharCode(chr++) : '';
        }
    }
    return ret;
}

function filter(frames) {
    var i;
    var ends = 0;
    for (i = 0; i < frames.length; i++) {
        if (frames[i].length > 1) ends++;
    }
    if (ends > 3) return false;
    var run = 0;
    for (i = 1; i < frames.length; i++) {
        if (run || frames[i-1].length === 1) {
            if (frames[i].length === 1) {
                if (++run > 2) return false;
            } else if (frames[i].length > 1 && run) {
                return false;
            } else {
                run = 0;
            }
        }
    }
    simplify(frames);
    return true;
}

function simplify(frames) {
    var i = 1;
    while (i < frames.length) {
        var a = frames[i-1];
        var b = frames[i];
        if (!b.length) {
            if (!a.length) {
                frames.splice(i-1, 2, []);
            } else {
                frames.splice(i, 1);
            }
        } else if (b.length === 1 && b[0] === '') {
            if (a.length === 1 && a[0] === '') {
                frames.splice(i-1, 2, ['']);
            } else {
                frames.splice(i, 1);
            }
        } else {
            i++;
        }
    }
}

function hookupEnd(stream, callback) {
    stream.on('finish', onFinish);
    stream.on('error', onError);
    function onError(err) {
        stream.removeListener('finish', onFinish);
        stream.removeListener('error', onError);
        callback(err);
    }
    function onFinish() {
        stream.removeListener('finish', onFinish);
        stream.removeListener('error', onError);
        callback();
    }
}

function getArg(arg) {
    var val = arg.read();
    if (val !== null) {
        return val.toString();
    } else {
        return val;
    }
}
