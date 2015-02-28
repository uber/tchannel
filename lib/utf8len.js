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

function bytesForCodepoint(c) {
    if (c < 0x80) {
        // 0bbbbbbb
        return 1;
    } else if (c < 0x800) {
        // 110bbbbb 10bbbbbb
        return 2;
    } else if (c < 0x10000) {
        // 1110bbbb 10bbbbbb 10bbbbbb
        return 3;
    } else if (c < 0x200000) {
        // 11110bbb 10bbbbbb 10bbbbbb 10bbbbbb
        return 4;
    } else if (c < 0x4000000) {
        // 111110bb 10bbbbbb 10bbbbbb 10bbbbbb 10bbbbbb
        return 5;
    } else if (c < 0x80000000) {
        // 1111110b 10bbbbbb 10bbbbbb 10bbbbbb 10bbbbbb 10bbbbbb
        return 6;
    } else {
        throw new Error('codepoint out of range');
    }
}

// turns out to be faster than Buffer.byteLength(s, 'utf-8')
function numBytesForUtf8String(s) {
    var n = 0;
    for (var i = 0; i < s.length; ++i) {
        n += bytesForCodepoint(s.charCodeAt(i));
    }
    return n;
}

module.exports = numBytesForUtf8String;
