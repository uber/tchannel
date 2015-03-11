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

module.exports.Request = PingRequest;
module.exports.Response = PingResponse;

function PingRequest(version, headers) {
    var self = this;
    self.type = PingRequest.TypeCode;
    self.version = version || 0;
    self.headers = headers || {};
}

PingRequest.TypeCode = 0xd0;

// Pings requests have no body.
PingRequest.read = read.skip(0);

function PingResponse(version, headers) {
    var self = this;
    self.type = PingResponse.TypeCode;
    self.version = version || 0;
    self.headers = headers || {};
}

PingResponse.TypeCode = 0xd1;

// Pongs  have no body.
PingResponse.read = read.skip(0);
