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
var Checksum = require('./checksum');
var ArgsRW = require('./args');
var argsrw = ArgsRW(bufrw.buf2);

var Flags = {
    Fragment: 0x01
};

// flags:1 csumtype:1 (csum:4){0,1} (arg~2)+
function CallRequestCont(flags, csum, args) {
    if (!(this instanceof CallRequestCont)) {
        return new CallRequestCont(flags, csum, args);
    }
    var self = this;
    self.type = CallRequestCont.TypeCode;
    self.flags = flags || 0;
    self.csum = Checksum.objOrType(csum);
    self.args = args || [];
}

CallRequestCont.TypeCode = 0x13;
CallRequestCont.Flags = Flags;
CallRequestCont.RW = bufrw.Struct(CallRequestCont, [
    {name: 'flags', rw: bufrw.UInt8}, // flags:1
    {name: 'csum', rw: Checksum.RW},  // csumtype:1 (csum:4){0,1}
    {name: 'args', rw: argsrw}        // (arg~2)+
]);

CallRequestCont.prototype.splitArgs = function splitArgs(args, maxSize) {
    var self = this;
    // assert not self.args
    var lenRes = self.constructor.RW.byteLength(self);
    if (lenRes.err) throw lenRes.err;
    var maxBodySize = maxSize - lenRes.length;
    var remain = maxBodySize;
    var ret = [];
    var isLast = !(self.flags & Flags.Fragment);
    self.flags |= Flags.Fragment;
    var argSize = 2;

    while (args.length) {
        var first = [];
        var split = false;
        for (var i = 0; i < args.length; i++) {
            var arg = args[i];
            var argLength = argSize + arg.length;
            if (argLength <= remain) {
                first.push(arg);
                remain -= argLength;
            } else {
                first.push(arg.slice(0, remain - argSize));
                args = [arg.slice(remain - argSize)].concat(args.slice(i+1));
                split = true;
                break;
            }
        }
        self.args = first;
        ret.push(self);
        if (split) {
            self = new self.constructor(self.flags | Flags.Fragment, self.csum.type);
        } else {
            break;
        }
    }
    if (isLast) ret[ret.length - 1].flags &= ~ Flags.Fragment;

    return ret;
};

CallRequestCont.prototype.updateChecksum = function updateChecksum(prior) {
    var self = this;
    return self.csum.update(self.args, prior);
};

CallRequestCont.prototype.verifyChecksum = function verifyChecksum(prior) {
    var self = this;
    return self.csum.verify(self.args, prior);
};

// flags:1 csumtype:1 (csum:4){0,1} (arg~2)+
function CallResponseCont(flags, csum, args) {
    if (!(this instanceof CallResponseCont)) {
        return new CallResponseCont(flags, csum, args);
    }
    var self = this;
    self.type = CallResponseCont.TypeCode;
    self.flags = flags || 0;
    self.csum = Checksum.objOrType(csum);
    self.args = args || [];
}

CallResponseCont.TypeCode = 0x14;
CallResponseCont.Flags = Flags;
CallResponseCont.RW = bufrw.Struct(CallResponseCont, [
    {name: 'flags', rw: bufrw.UInt8}, // flags:1
    {name: 'csum', rw: Checksum.RW},  // csumtype:1 (csum:4){0},1}
    {name: 'args', rw: argsrw}        // (arg~2)+
]);

CallResponseCont.prototype.splitArgs = CallRequestCont.prototype.splitArgs;

CallResponseCont.prototype.updateChecksum = function updateChecksum(prior) {
    var self = this;
    return self.csum.update(self.args, prior);
};

CallResponseCont.prototype.verifyChecksum = function verifyChecksum(prior) {
    var self = this;
    return self.csum.verify(self.args, prior);
};

module.exports.RequestCont = CallRequestCont;
module.exports.ResponseCont = CallResponseCont;
