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

// num:2 ( service~1 cost:1 ){num}

function Advertise(services) {
    var self = this;
    self.services = services || {};
}

Advertise.TypeCode = 0x20;

Advertise.RW = bufrw.Base(advertiseByteLength, readAdvertiseFrom, writeAdvertiseInto);

function advertiseByteLength(ad) {
    var names = Object.keys(ad.services);

    // num:2
    var length = bufrw.UInt16BE.width;

    for (var i = 0; i < names.length; i++) {
        var name = names[i];

        // service~1
        var res = bufrw.str1.byteLength(name);
        if (res.err) return res;
        length += res.length;

        // cost:1
        length += bufrw.UInt8.width;
    }

    return bufrw.LengthResult.just(length);
}

function readAdvertiseFrom(buffer, offset) {
    var services = {};

    // num:2
    var res = bufrw.UInt16BE.readFrom(buffer, offset);
    if (res.err) return res;
    offset = res.offset;
    var n = res.value;

    for (var i = 0; i < n; i++) {
        // service~1
        res = bufrw.str1.readFrom(buffer, offset);
        if (res.err) return res;
        offset = res.offset;
        var name = res.value;

        // cost:1
        res = bufrw.UInt8.readFrom(buffer, offset);
        if (res.err) return res;
        offset = res.offset;
        var cost = res.value;

        var info = {cost: cost};
        services[name] = info;

    }

    var ad = new Advertise(services);
    return bufrw.ReadResult.just(offset, ad);
}

function writeAdvertiseInto(ad, buffer, offset) {
    var names = Object.keys(ad.services);

    // num:2
    var res = bufrw.UInt16BE.writeInto(names.length, buffer, offset);
    if (res.err) return res;
    offset = res.offset;

    for (var i = 0; i < names.length; i++) {
        var name = names[i];
        var info = ad.services[name];
        var cost = info.cost || 0;

        // service~1
        res = bufrw.str1.writeInto(name, buffer, offset);
        if (res.err) return res;
        offset = res.offset;

        // cost:1
        res = bufrw.UInt8.writeInto(cost, buffer, offset);
        if (res.err) return res;
        offset = res.offset;
    }

    return bufrw.WriteResult.just(offset);
}

module.exports = Advertise;
