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

var read = require('../lib/read');
var write = require('../lib/write');

module.exports = ErrorResponse;

var emptyBuffer = new Buffer(0);

function ErrorResponse(code, message) {
    if (!(this instanceof ErrorResponse)) {
        return new ErrorResponse(code, message);
    }
    var self = this;
    self.code = code;
    self.message = message || emptyBuffer;
}

ErrorResponse.TypeCode = 0xff;

// code:1 message~2
ErrorResponse.prototype.read = read.chained(read.series([
    read.UInt8, // code:1
    read.buf2   // message~2
]), function buildErrorRes(results, buffer, offset) {
    var code = results[0];
    var message = results[1];
    var res = new ErrorResponse(code, message);
    return [null, offset, res];
});

// code:1 message~2
ErrorResponse.prototype.write = function writeErrorRes() {
    var self = this;
    return write.series([
        write.UInt8(self.code, 'ErrorResponse code'),  // code:1
        write.buf2(self.message, 'ErrorResponse arg1') // message~2
    ]);
};
