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

var Logger = require('logtron');
var parseArgs = require('minimist');
var util = require('util');

var TChannel = require('../channel');
var setupRawTestService = require('./lib/raw_service');

var argv = parseArgs(process.argv.slice(2), {
    alias: {
        h: 'host',
        p: 'port'
    },
    default: {
        host: '127.0.0.1',
        port: 0,
    }
});

var chan = TChannel({
    logger: Logger({
        meta: {
            team: 'testers',
            project: 'tchannel'
        },
        backends: Logger.defaultBackends({
            console: !argv.logFile,
            logFile: argv.logFile
        })
    })
});
setupRawTestService(chan);

// TODO: logger?
chan.listen(argv.port, argv.host);
chan.on('listening', function onListening() {
    var addr = chan.address();
    process.stdout.write(util.format(
        'listening on %s:%s\n', addr.address, addr.port
    ));
});
