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

var read = require('../../lib/read.js');
var write = require('../../lib/write.js');

module.exports = TestBody;

function TestBody(payload) {
    if (!(this instanceof TestBody)) {
        return new TestBody(payload);
    }
    var self = this;
    self.type = TestBody.TypeCode;
    self.payload = payload;
}

TestBody.read = read.chained(read.buf1, function(payload, buffer, offset) {
    var body = new TestBody(payload);
    return [null, offset, body];
});

TestBody.prototype.write = function writeTestBody() {
    var self = this;
    return write.buf1(self.payload);
};

TestBody.TypeCode = 0x00;

TestBody.catBuffer = Buffer([
    0x00, 0x14,             // size:2:
    TestBody.TypeCode,      // type:1
    0x01,                   // reserved:1
    0x02, 0x03, 0x04, 0x05, // id:4
    0x06, 0x07, 0x08, 0x09, // reserved:4
    0x0a, 0x0b, 0x0c, 0x0d, // reserved:4
    0x03, 0x63, 0x61, 0x74  // payload~1
]);

TestBody.dogeBuffer = Buffer([
    0x00, 0x15,                  // size:2:
    TestBody.TypeCode,           // type:1
    0x00,                        // reserved:1
    0x01, 0x02, 0x03, 0x04,      // id:4
    0x00, 0x00, 0x00, 0x00,      // reserved:4
    0x00, 0x00, 0x00, 0x00,      // reserved:4
    0x04, 0x64, 0x6f, 0x67, 0x65 // payload~1
]);

TestBody.testWith = function testWidTestBody(desc, t) {
    var test = require('tape');
    var Frame = require('../../v2/frame.js');
    test(desc, function s(assert) {
        Frame.Types[TestBody.TypeCode] = TestBody;
        assert.once('end', function removeTestBody() {
            delete Frame.Types[TestBody.TypeCode];
        });
        return t(assert);
    });
};
