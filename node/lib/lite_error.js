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

module.exports = LiteError;

function LiteError() {
    if (!(this instanceof LiteError)) {
        return new LiteError();
    }
}

LiteError.prototype.toError = function toError() {
    var result = new Error();
    Object.defineProperty(result, 'type', {
        value: this.type,
        enumerable: true,
        writable: true,
        configurable: true
    });

    var keys = Object.keys(this);
    var i;
    for (i = 0; i < keys.length; i++) {
        result[keys[i]] = this[keys[i]];
    }

    if (!result.fullType) {
        result.fullType = result.type;
    }

    return result;
};

LiteError.isLiteError = function isLiteError(err) {
    if (err && err.constructor) {
        if (err.constructor.name === 'LiteError') {
            return true;
        }

        if (err.constructor.super_ && err.constructor.super_.name === 'LiteError') {
            return true;
        }
    }
    return false;
};

LiteError.isError = function isError(err) {
    return Object.prototype.toString.call(err) === '[object Error]' ||
        LiteError.isLiteError(err);
};
