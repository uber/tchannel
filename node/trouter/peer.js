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
var argv = require('minimist')(process.argv.slice(2));

var TChannel = require('../channel');
var TRouterCTL = require('./ctl');

var port = argv._[0];
var host = argv._[1];
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
chan.listen(port, host, onListening);

chan.on('servicesUpdated', function onServicesUpdated(remoteName, services) {
    trouterChan.peers.values().forEach(function each(peer) {
        peer.connect().advertise();
    });
});

function onListening() {
    chan.logger.info('listening on', {
        hostPort: chan.hostPort
    });
    ctl.announce('trouter', host, port);
}

ctl.on('announce', function onAnnounce(body, rinfo) {
    if (body.host === host && body.port === port) return;

    if (body.serviceName === 'trouter') {
        var hostPort = body.host + ':' + body.port;
        var peer = trouterChan.peers.add(hostPort);
        if (!peer.isConnected()) {
            trouterChan.logger.info('connecting to trouter peer', {
                hostPort: hostPort
            });
            peer.connect();
        }
        return;
    }

    chan.logger.info('unknown announce', {
        body: body,
        rinfo: rinfo
    });
});

ctl.on('find', function onFind(body, rinfo) {
    if (body.host === host && body.port === port) return;

    if (body.serviceName === 'trouter') {
        ctl.found('trouter', host, port);
        return;
    }

    chan.logger.info('unknown find', {
        body: body,
        rinfo: rinfo
    });
});
