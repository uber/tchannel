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

var LENGTH_ARRAYS = {};

function clean(str, field) {
    var copy;

    if (!str) {
        return field;
    }

    copy = LENGTH_ARRAYS[str.length];
    if (!copy) {
        copy = LENGTH_ARRAYS[str.length] = [];
    }

    for (var i = 0; i < str.length; i++) {
        var char = str[i];

        if (char === ':' ||
            char === '/' ||
            char === '.' ||
            char === '{' ||
            char === '}'
        ) {
            copy[i] = '-';
        } else {
            copy[i] = char;
        }
    }

    return copy.join('');
}

function cleanHostPort(str, field) {
    var copy;

    if (!str) {
        return field;
    }

    var length = str.indexOf(':');

    copy = LENGTH_ARRAYS[length];
    if (!copy) {
        copy = LENGTH_ARRAYS[length] = [];
    }
    for (var i = 0; i < length; i++) {
        var char = str[i];

        if (char === '/' ||
            char === '.' ||
            char === '{' ||
            char === '}'
        ) {
            copy[i] = '-';
        } else {
            copy[i] = char;
        }
    }

    return copy.join('');
}

module.exports.clean = clean;
module.exports.cleanHostPort = cleanHostPort;
