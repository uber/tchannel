#!/usr/bin/env node
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

/*global process */

// Usage: node bin/adhoc.js <serviceName> <port>
// Creates a service on localhost, connected to Autobahn on localhost.

var os = require('os');
var console = require('console');

var TChannel = require('../');
var HyperbahnClient = require('../hyperbahn/');

if (require.main === module) {
    main();
}

function main() {
    if (!process.argv[2]) {
        throw new Error('need serviceName');
    }
    if (!process.argv[3]) {
        throw new Error('need a port');
    }

    /*eslint no-console: 0*/
    var serviceName = process.argv[2];
    var port = +process.argv[3];
    var host = getHost();
    var autobahnPort = 21300;
    var autobahnHost = host;

    var tchannel = new TChannel({});

    var logtron = tchannel.logger;

    tchannel.makeSubChannel({
        serviceName: serviceName
    }).register('echo', function echo(req, res, arg2, arg3) {
        res.headers.as = 'raw';
        res.sendOk(arg2, arg3);
    });

    var hyperbahnClient = new HyperbahnClient({
        tchannel: tchannel,
        serviceName: serviceName,
        hostPortList: [
            autobahnHost + ':' + autobahnPort
        ],
        forwardRetries: 5,
        checkForwardListInterval: 60000,
        advertisementTimeout: 5000,
        logger: logtron
    });

    console.log('service', serviceName, 'port', port);

    tchannel.listen(port, host, function onListen(err) {
        if (err) {
            throw err;
        }

        console.log('listening', tchannel.address());
        console.log('advertising', autobahnHost, autobahnPort);

        hyperbahnClient.on('advertised', function onAdvertised(err2) {
            if (err2) {
                throw err2;
            }

            console.log('advertised');
        });
        hyperbahnClient.advertise();
    });
}

function getHost() {
    var ifaces = os.networkInterfaces();
    var ifaceNames = Object.keys(ifaces);
    for (var index = 0; index < ifaceNames.length; index++) {
        var ifaceName = ifaceNames[index];
        var ports = ifaces[ifaceName];
        for (var portIndex = 0; portIndex < ports.length; portIndex++) {
            var port = ports[portIndex];
            if (!port.internal && port.family === 'IPv4') {
                return port.address;
            }
        }
    }
}
