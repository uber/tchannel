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
var argv = require('minimist')(process.argv.slice(2), {
    '--': true
});
var port = argv._[0];
var host = argv._[1];
var name = argv._[2];

var TChannel = require('../channel');
var TRouterCTL = require('./ctl');

var ctl = new TRouterCTL();
var chan = TChannel({
    logger: Logger({
        meta: {
            team: 'dsg',
            project: 'trouter'
        },
        backends: Logger.defaultBackends({
            console: true
        })
    })
});
chan.listen(port, host, onListening);

var svcchan = chan.makeSubChannel({
    serviceName: name,
    advertise: true
});
svcchan.register('run', run);

var spawn = require('child_process').spawn;

function run(req, res, arg2, arg3) {
    var cmd = [].concat(argv['--']);

    // TODO: shlex arg2 apart or some such
    arg2 = String(arg2);
    if (arg2.length) cmd.push(arg2);

    chan.logger.info('running', {
        'cmd': cmd
    });
    var proc = spawn(cmd[0], cmd.slice(1), {
        stdio: ['pipe', 'pipe', 'pipe']
    });
    var parts = [];
    proc.stdout.on('data', function(chunk) {
        parts.push(chunk);
    });
    proc.on('close', function(code) {
        var body = Buffer.concat(parts);
        res.sendOk(String(code), body);
    });
    proc.stdin.write(arg3);
}

function onListening() {
    chan.logger.info('listening on', {
        hostPort: chan.hostPort
    });
    ctl.on('found', onFound);
    ctl.on('announce', onFound);
    ctl.find('trouter');
}

function onFound(body) {
    if (body.serviceName === 'trouter') {
        var hostPort = body.host + ':' + body.port;
        var peer = chan.peers.add(hostPort);
        if (!peer.isConnected()) {
            chan.logger.info('connecting to found service', body);
            peer.connect();
        }
    }
}
