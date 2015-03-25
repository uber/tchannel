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

module.exports = Tracing;

function Tracing(spanid, parentid, traceid, flags) {
    if (!(this instanceof Tracing)) {
        return new Tracing(spanid, parentid, traceid, flags);
    }
    var self = this;

    self.spanid = spanid;
    self.parentid = parentid;
    self.traceid = traceid;
    self.flags = flags;
}

Tracing.RW = bufrw.Struct(Tracing, [
    {name: 'spanid', rw: bufrw.FixedWidth(8)},
    {name: 'parentid', rw: bufrw.FixedWidth(8)},
    {name: 'traceid', rw: bufrw.FixedWidth(8)},
    {name: 'flags', rw: bufrw.UInt8}
]);

Tracing.emptyTracing = {
    spanid: new Buffer(8),
    parentid: new Buffer(8),
    traceid: new Buffer(8),
    flags: 0
};

Tracing.emptyTracing.spanid.fill(0);
Tracing.emptyTracing.parentid.fill(0);
Tracing.emptyTracing.traceid.fill(0);
