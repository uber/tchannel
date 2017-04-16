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

// constants for easy declaration, e.g.:
//   size = 1 * Mi
var Ki = Math.pow(2, 10);
var Mi = Math.pow(2, 20);
var Gi = Math.pow(2, 30);
var Ti = Math.pow(2, 40);
module.exports.Ki = Ki;
module.exports.Mi = Mi;
module.exports.Gi = Gi;
module.exports.Ti = Ti;

/*
 * decomposes byte numbers into human-friendly linear combinations, e.g.:
 * - pretty(1025)       => '1Ki + 1'
 * - pretty(32745)      => '31Ki + 1001'
 * - pretty(9372651)    => '8Mi + 960Ki + 1003'
 * - pretty(2163342357) => '2Gi + 15Mi + 127Ki + 21'
 */

var units = {
    Ti: Ti,
    Gi: Gi,
    Mi: Mi,
    Ki: Ki
};

var tiers = Object.keys(units).map(function each(name) {
    return [name, units[name]];
});

var pattern = /(\d+)(Ki|Mi|Gi|Ti)?/;

function parse(s) {
    if (typeof s === 'number') return s;
    var n = 0;
    var parts = s.split(/\s*\+\s*/);
    for (var i = 0; i < parts.length; i++) {
        var match = pattern.exec(parts[i]);
        if (!match) return NaN;
        var d = parseInt(match[1], 10);
        if (match[2]) {
            if (units[match[2]] === undefined) return NaN;
            d *= units[match[2]];
        }
        n += d;
    }
    return n;
}

module.exports.parse = parse;

function pretty(n, suffix) {
    suffix = suffix || '';
    var s = '';
    var i = 0;
    while (n > 0 && i < tiers.length) {
        if (s.length > 0) s += ' + ';
        var name = tiers[i][0];
        var unit = tiers[i][1];
        if (n >= unit) {
            var d = Math.floor(n / unit);
            n = n % unit;
            s += d.toString(10) + name + suffix;
        }
        i++;
    }
    if (n > 0) {
        if (s.length > 0) s += ' + ';
        s += n.toString(10) + suffix;
    } else if (!s.length) {
        s += '0' + suffix;
    }
    return s;
}

module.exports.pretty = pretty;
