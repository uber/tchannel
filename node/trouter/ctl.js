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

var bufrw = require('bufrw');
var inherits = require('util').inherits;

var MultiCTL = require('../lib/multicast_ctl');

var BodyCases = {};

var Announce = 1;
BodyCases[Announce] = bufrw.Struct({
    serviceName: bufrw.str1,
    host: bufrw.str1, // XXX UInt32BE?
    port: bufrw.UInt16BE
});

var Find = 2;
BodyCases[Find] = bufrw.Struct({
    serviceName: bufrw.str1
});

var Found = 3;
BodyCases[Found] = bufrw.Struct({
    serviceName: bufrw.str1,
    host: bufrw.str1, // XXX UInt32BE?
    port: bufrw.UInt16BE
});

function TRouterCTL() {
    var self = this;
    MultiCTL.call(self, BodyCases, 4040, ['239.0.192.192']);
    self.on('frame', self.onFrame);
}
inherits(TRouterCTL, MultiCTL);

TRouterCTL.prototype.announce = function announce(serviceName, host, port) {
    var self = this;
    self.send(Announce, {
        serviceName: serviceName,
        host: host,
        port: port
    });
};

TRouterCTL.prototype.find = function find(serviceName) {
    var self = this;
    self.send(Find, {
        serviceName: serviceName
    });
};

TRouterCTL.prototype.found = function found(serviceName, host, port) {
    var self = this;
    self.send(Found, {
        serviceName: serviceName,
        host: host,
        port: port
    });
};

TRouterCTL.prototype.onFrame = function onFrame(type, body, rinfo) {
    var self = this;
    switch (type) {
        case Announce:
            self.emit('announce', body, rinfo);
            break;
        case Find:
            self.emit('find', body, rinfo);
            break;
        case Found:
            self.emit('found', body, rinfo);
            break;
    }
};

module.exports = TRouterCTL;
