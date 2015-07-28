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

// require('format-stack').set({
//   traces: 'short' // 'long' works too, maybe.. ;)
// });

/*global process */

// Usage: node bin/adhoc_multi.js <relay_count> <serviceName> <port>
// Creates relay_count services on localhost, connected to Autobahn on
// localhost. The services call each other to do echo.

var os = require('os');
var console = require('console');
var fs = require('fs');
var CountedReadySignal = require('ready-signal/counted');

var TChannel = require('../');
var HyperbahnClient = require('../hyperbahn/');
var DebugLogger = require('debug-logtron');

if (require.main === module) {
    main();
}

var EP_NAME;

function main() {
    if (process.argv[2] === '-h' || process.argv[2] === '--help') {
        console.log('adhoc_multi [relay_count] [serviceName] [port]');
        return;
    }

    /*eslint no-console: 0*/
    var rcount = Math.abs(process.argv[2] || 1);
    var opts = {};
    opts.listenReady = CountedReadySignal(rcount);
    opts.advertiseReady = CountedReadySignal(rcount);
    opts.serviceName = process.argv[3] || 'service';
    opts.port = +process.argv[4] || 6000;
    opts.host = getHost();
    opts.autobahnList = getAutobahnHost();
    opts.logger = DebugLogger('adhocMulti');
    EP_NAME = 'echo';
    start(opts, rcount);
}

function start(opts, rcount) {
    var clients = [];
    for (var i = 0; i < rcount; i++) {
        opts.i = i;
        if (i === rcount - 1) {
            opts.isLast = true;
        }
        clients.push(createClient(opts));
    }

    opts.listenReady(function onListen() {
        console.log('All channel listen started.');
        for (i = 0; i < rcount; i++) {
            advertise(opts, clients[i]);
        }
    });

    opts.advertiseReady(function onAdvertised() {
        console.log('All clients advertised.');
        var chan = createChannel(opts);
        var service = opts.serviceName + '_0';
        chan.makeSubChannel({
            serviceName: service,
            peers: opts.autobahnList
        }).request({
            headers: {
                cn: opts.serviceName,
                as: 'raw'
            },
            hasNoParent: true,
            serviceName: service
        }).send(
            EP_NAME + '_0',
            'aa2',
            'hello',
            function onRes(err, res) {
                if (err) {
                    console.log(err);
                } else {
                    console.log(String(res.arg3));
                }
            }
        );
    });
}

function createChannel(options) {
    var tchannel = new TChannel({
        trace: true,
        logger: options.logger,
        traceSample: 1
    });

    return tchannel;
}

function createClient(options) {
    var tchannel = createChannel(options);
    var onResponse = options.isLast ? finish : forwardChannel;
    var count = options.i;

    console.log('advertising ' + enumerated(EP_NAME));
    tchannel.makeSubChannel({
        serviceName: enumerated(options.serviceName)
    }).register(enumerated(EP_NAME), onResponse);

    var hyperbahnClient = new HyperbahnClient({
        tchannel: tchannel,
        serviceName: enumerated(options.serviceName),
        callerName: enumerated(options.serviceName, count - 1),
        hostPortList: options.autobahnList,
        forwardRetries: 5,
        checkForwardListInterval: 60000,
        adverisementTimeout: 5000,
        logger: options.logger
    });

    console.log('Starting to listen service',
        options.serviceName, 'port', options.port + count);
    tchannel.listen(options.port + count, options.host, onListen);
    return {
        channel: tchannel,
        client: hyperbahnClient
    };

    function onListen(err) {
        if (err) {
            throw err;
        }

        console.log('listening', tchannel.address());
        options.listenReady.signal();
    }

    function enumerated(name, index) {
        index = index || count;
        return name + '_' + index;
    }

    function forwardChannel(req, res, arg2, arg3) {
        var fchan = createChannel(options);
        var service = enumerated(options.serviceName, count + 1);

        fchan.makeSubChannel({
            serviceName: service,
            peers: options.autobahnList
        }).request({
            headers: {
                cn: enumerated(options.serviceName, count),
                as: 'raw'
            },
            serviceName: service,
            parent: req
        }).send(
            enumerated(EP_NAME, count + 1),
            arg2,
            arg3,
            function onRet(e, r) {
                if (e) {
                    console.log(e);
                } else {
                    res.headers.as = 'raw';
                    res.sendOk(
                        r.arg2,
                        enumerated(options.serviceName) +
                            ' says "' + String(r.arg3) + '"'
                    );
                }
            }
        );
    }

    function finish(req, res, arg2, arg3) {
        res.headers.as = 'raw';
        res.sendOk(
            arg2,
            enumerated(options.serviceName) + ' says "' + String(arg3) + '"');
    }
}

function advertise(options, pair) {
    var hyperbahnClient = pair.client;
    console.log('Advertising at Hyperbahn', hyperbahnClient.hostPortList[0]);

    hyperbahnClient.on('advertised', onAdvertised);
    hyperbahnClient.advertise();
    function onAdvertised(err2) {
        if (err2) {
            throw err2;
        }
        console.log('Advertised at Hyperbahn', hyperbahnClient.hostPortList[0]);
        options.advertiseReady.signal();
    }
}

function getAutobahnHost() {
    try {
        var hostPortListString =
        fs.readFileSync('/etc/uber/autobahn/ringpop-v2.json', 'utf8');
        return JSON.parse(hostPortListString);
    } catch (err) {
        if (err.code !== 'ENOENT') {
            throw err;
        }
        var host = getHost();
        return [host + ':21300', host + ':21301'];
    }
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
