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

var extend = require('xtend');
var util = require('util');
var TChannel = require('../../index.js');
var parallel = require('run-parallel');
var echoLogger = require('./logger');

module.exports = allocCluster;

function allocCluster(n, opts) {
    opts = opts || {};

    var host = 'localhost';
    var ret = {
        hosts: new Array(n),
        channels: new Array(n),
        destroy: destroy
    };

    for (var i=0; i<n; i++) {
        var port = randomPort();
        ret.channels[i] = TChannel(extend({
            logger: opts.debugLog ? echoLogger(process.stdout) : null,
            host: host,
            port: port
        }, opts));
        ret.hosts[i] = util.format('%s:%s', host, port);
    }

    return ret;

    function destroy(cb) {
        parallel(ret.channels.map(function(chan) {
            return function(done) {
                chan.quit(done);
            };
        }), cb);
    }
}

function randomPort() {
    return 20000 + Math.floor(Math.random() * 20000);
}
