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

var format = require('util').format;

module.exports.debugShouldRequestStack = debugShouldRequestStack;
module.exports.randSeq = randSeq;

function debugShouldRequestStack() {
    var stack = (new Error()).stack;
    var stackLines = stack.split(/\n/);
    for (var i = 0; i < stackLines.length; i++) {
        if (/shouldRequest/.test(stackLines[i])) {
            break;
        }
    }
    stackLines = stackLines
        .slice(i)
        .filter(function each(line) {
            if (/_maybeInvalidateScore/.test(line)) {
                return false;
            }
            return true;
        })
        .map(function each(line) {
            var match = /at ([^ ]+)/.exec(line);
            return match[1];
        })
        ;

    elide('.shouldRequest(%s)', /\.shouldRequest$/, stackLines);
    elide('.add(%s)', /\.add/, stackLines);

    return stackLines.join(' < ');
}

function randSeq(seq, debug) {
    var i = 0;
    return function random() {
        var r = seq[i];
        if (debug) {
            console.log('# randSeq[%s]: %s from %s',
                        i, r, debugShouldRequestStack());
        }
        i = (i + 1) % seq.length;
        return r;
    };
}

function elide(fmt, pattern, array) {
    for (var i = 0; i < array.length; i++) {
        if (!pattern.test(array[i])) {
            continue;
        }
        for (var j = i + 1; j < array.length; j++) {
            if (!pattern.test(array[j])) {
                break;
            }
        }
        var gone = array.splice(i, j - i);
        var rep = format(fmt, gone.map(replace).join(' < '));
        array.splice(i, 0, [rep]);
    }

    function replace(str) {
        return str.replace(pattern, '');
    }
}
