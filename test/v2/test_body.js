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

var bufrw = require('bufrw');

module.exports = TestBody;

function TestBody(payload) {
    if (!(this instanceof TestBody)) {
        return new TestBody(payload);
    }
    var self = this;
    self.type = TestBody.TypeCode;
    self.payload = payload;
}

TestBody.TypeCode = 0x00;

TestBody.RW = bufrw.Struct(TestBody, {
    payload: bufrw.buf1
});

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
