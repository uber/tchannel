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

var os = require('os');
var process = require('process');
var Statsd = require('uber-statsd-client');
var NullStatsd = require('uber-statsd-client/null');

module.exports = createStatsd;

function createStatsd(opts) {
    /*eslint no-process-env: 0 */
    return opts && opts.host && opts.port ? new Statsd({
        host: opts.host,
        port: opts.port,
        prefix: [
            opts.project,
            process.env.NODE_ENV,
            os.hostname().split('.')[0]
        ].join('.'),
        packetQueue: opts.packetQueue || null,
        socketTimeout: opts.socketTimeout || null
    }) : NullStatsd();
}
