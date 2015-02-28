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
// Modified to expose an enabled boolean
// https://github.com/joyent/node/blob/fbfe562d71ae8d8f8bbf627808c755e513e4e905/lib/util.js#L96-L114
var util = require('util');
var debugEnv = process.env.NODE_DEBUG || '';
var cache = {};

module.exports = function (set) {
    set = set.toUpperCase();

    if (!cache[set]) {
        if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnv)) {
            var pid = process.pid;

            cache[set] = function () {
                console.error('%s %d: %s', set, pid, util.format.apply(util, arguments));
            };
            // addition
            cache[set].enabled = true;
        } else {
            cache[set] = function () {};
            // addition
            cache[set].enabled = false;
        }
    }

    return cache[set];
};
