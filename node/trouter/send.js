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
var name = argv._[0];

var TChannel = require('../channel');
var RelayHandler = require('../relay_handler');
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
var trouterChan = chan.makeSubChannel({
    serviceName: 'trouter'
});
trouterChan.handler = new RelayHandler(trouterChan, 'trouter');

ctl.on('found', onFound);
ctl.on('announce', onFound);
ctl.find('trouter');

var got = false;

function onFound(body) {
    if (body.serviceName === 'trouter') {
        var hostPort = body.host + ':' + body.port;
        var peer = trouterChan.peers.add(hostPort);
        if (!got && !peer.isConnected()) {
            got = true;
            chan.logger.info('connecting to found service', body);
            peer.connect();
            doit();
        }
    }
}

function doit() {
    var arg1 = argv._[1];
    var arg2 = argv._[2];
    var arg3 = argv._[3];
    trouterChan.request({
        serviceName: name
    }).send(arg1, arg2, arg3, done);
}

function done(err, res, arg2, arg3) {
    if (err) {
        console.error(err);
        return;
    }

    process.stdout.write('// arg2\n');
    process.stdout.write(arg2);
    process.stdout.write('// arg3\n');
    process.stdout.write(arg3);

    ctl.close();
    chan.close();
}
