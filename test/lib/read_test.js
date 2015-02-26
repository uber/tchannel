// Copyright (c) 2015 Uber Technologies, Inc.

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

var TypedError = require('error/typed');
var color = require('ansi-color').set;
var hex = require('hexer');
var util = require('util');

var ShortReadError = TypedError({
    type: 'short-read',
    message: 'read did not consume entire buffer',
    offset: null,
    length: null
});

module.exports = testRead;

/* jshint maxparams:6 */

function testRead(assert, reader, buffer, t, done) {
    if (!done) done = assert.end;
    var res = reader(buffer, 0);
    var err = res[0];
    var offset = res[1];
    var val = res[2];

    if (err) {
        hexdump('read error at');
        var errname = err.type ? err.name : err.constructor.name;
        console.log(util.format('- %s: %s', errname, err.message));
        done(err);
    } else if (offset < buffer.length) {
        hexdump('read stopped short at');
        done(ShortReadError({
            offset: offset,
            length: buffer.length
        }));
    } else if (val === null || val === undefined) {
        done(new Error('Expected to have read a value'));
    } else {
        t(val, done);
    }

    function hexdump(desc) {
        console.log(hexHighlight(buffer, {
            end: {
                desc: desc,
                offset: offset,
                color: 'red+bold'
            }
        }));
    }
}

testRead.shouldError = function shouldError(assert, reader, buffer, t, done) {
    if (!done) done = assert.end;
    var res = reader(buffer, 0);
    var err = res[0];
    var offset = res[1];
    if (err) {
        err.offset = offset;
        t(err, done);
    } else {
        done(new Error('expected a read error'));
    }
};

function hexHighlight(buffer, highlights) {
    var highlight = {};
    var trail = '';

    Object.keys(highlights).forEach(function eachHighlight(name) {
        var h = highlights[name];
        highlight[h.offset] = h.color;
    });

    var opts = {
        decorateHexen: decorate,
        decorateHuman: decorate
    };
    var out = hex(buffer, opts);

    Object.keys(highlights).forEach(function eachHighlight(name) {
        var h = highlights[name];
        var off = h.offset.toString(16);
        off = '0x' + pad('0', off, opts.offsetWidth);
        trail += util.format('- %s: %s\n',
            h.desc || name,
            color(off, h.color));
    });

    out += '\n' + trail;
    out = out.replace(/\n+$/, '');
    return out;
    function decorate(bufOffset, screenOffset, str) {
        var c = highlight[bufOffset];
        if (c) str = color(str, c);
        return str;
    }
}

function pad(c, s, width) {
    while (s.length < width) s = c + s;
    return s;
}
