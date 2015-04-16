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
var bufrw = require('bufrw');
var ReadMachine = require('bufrw/stream/read_machine');
var inherits = require('util').inherits;

var v2 = require('./v2');
var errors = require('./errors');
var RelayHandler = require('./relay_handler');

var TChannelConnectionBase = require('./connection_base');

function TChannelConnection(channel, socket, direction, remoteAddr) {
    if (remoteAddr === channel.hostPort) {
        throw new Error('refusing to create self connection'); // TODO typed error
    }

    var self = this;
    TChannelConnectionBase.call(self, channel, direction, remoteAddr);
    self.socket = socket;
    self.handler = new v2.Handler(extend({
        logger: self.channel.logger,
        random: self.channel.random,
        timers: self.channel.timers,
        hostPort: self.channel.hostPort,
        tracer: self.tracer
    }, self.options));
    self.mach = ReadMachine(bufrw.UInt16BE, v2.Frame.RW);

    self.setupSocket();
    self.setupHandler();
    self.start();
}
inherits(TChannelConnection, TChannelConnectionBase);

TChannelConnection.prototype.setupSocket = function setupSocket() {
    var self = this;

    self.socket.setNoDelay(true);
    self.socket.on('data', onSocketChunk);
    self.socket.on('close', onSocketClose);
    self.socket.on('error', onSocketError);

    function onSocketChunk(chunk) {
        self.mach.handleChunk(chunk, chunkHandled);
    }

    function chunkHandled(err) {
        if (err) {
            self.resetAll(errors.TChannelReadProtocolError(err, {
                remoteName: self.remoteName,
                localName: self.channel.hostPort
            }));
            self.socket.destroy();
        }
    }

    function onSocketClose() {
        self.resetAll(errors.SocketClosedError({reason: 'remote clossed'}));
        if (self.remoteName === '0.0.0.0:0') {
            self.channel.peers.delete(self.remoteAddr);
        }
    }

    function onSocketError(err) {
        self.onSocketError(err);
    }
};

TChannelConnection.prototype.setupHandler = function setupHandler() {
    var self = this;

    self.handler.write = function write(buf, done) {
        self.socket.write(buf, null, done);
    };

    self.mach.emit = handleReadFrame;

    self.handler.on('write.error', onWriteError);
    self.handler.on('error', onHandlerError);
    self.handler.on('call.incoming.request', onCallRequest);
    self.handler.on('call.incoming.response', onCallResponse);
    self.handler.on('call.incoming.error', onCallError);
    self.handler.on('advertise', onAdvertise);
    self.on('timedOut', onTimedOut);

    // TODO: restore dumping from old:
    // var stream = self.socket;
    // if (dumpEnabled) {
    //     stream = stream.pipe(Spy(process.stdout, {
    //         prefix: '>>> ' + self.remoteAddr + ' '
    //     }));
    // }
    // stream = stream
    //     .pipe(self.reader)
    //     .pipe(self.handler)
    //     ;
    // if (dumpEnabled) {
    //     stream = stream.pipe(Spy(process.stdout, {
    //         prefix: '<<< ' + self.remoteAddr + ' '
    //     }));
    // }
    // stream = stream
    //     .pipe(self.socket)
    //     ;

    function onWriteError(err) {
        self.resetAll(errors.TChannelWriteProtocolError(err, {
            remoteName: self.remoteName,
            localName: self.channel.hostPort
        }));
        self.socket.destroy();
    }

    function onHandlerError(err) {
        self.resetAll(err);
        // resetAll() does not close the socket
        self.socket.destroy();
    }

    function handleReadFrame(frame) {
        if (!self.closing) {
            self.lastTimeoutTime = 0;
        }
        self.handler.handleFrame(frame, handledFrame);
    }

    function handledFrame(err) {
        if (err) {
            onHandlerError(err);
        }
    }

    function onCallRequest(req) {
        self.handleCallRequest(req);
    }

    function onCallResponse(res) {
        var req = self.popOutReq(res.id);
        if (!req) {
            self.logger.info('response received for unknown or lost operation', {
                responseId: res.id,
                remoteAddr: self.remoteAddr,
                direction: self.direction,
            });
            return;
        }

        if (self.tracer) {
            // TODO: better annotations
            req.span.annotate('cr');
            self.tracer.report(req.span);
            res.span = req.span;
        }

        req.emit('response', res);
    }

    function onCallError(err) {
        var req = self.popOutReq(err.originalId);
        if (!req) {
            self.logger.info('error received for unknown or lost operation', err);
            return;
        }
        req.emit('error', err);
    }

    function onAdvertise(services) {
        self.handleAdvertisedServices(services);
    }

    function onTimedOut() {
        self.logger.warn(self.channel.hostPort + ' destroying socket from timeouts');
        self.socket.destroy();
    }
};

TChannelConnection.prototype.handleAdvertisedServices = function handleAdvertisedServices(services) {
    var self = this;
    var chan = self.channel.topChannel || self.channel;
    if (!chan.subChannels) return;
    var changes = 0;

    // add / update
    var i, name, svcchan;
    var names = Object.keys(services);
    for (i = 0; i < names.length; i++) {
        name = names[i];
        svcchan = chan.subChannels[name];
        if (!svcchan) {
            svcchan = chan.makeSubChannel({
                serviceName: name
            });
            svcchan.handler = new RelayHandler(svcchan, name);
        } else if (svcchan.handler.type !== 'tchannel.relay-handler') {
            continue;
        }
        var info = services[name];
        var cost = info.cost;
        if (!svcchan.peers.get(self.remoteName)) {
            svcchan.logger.info('adding service peer', {
                serviceName: name,
                hostPort: self.remoteName,
                cost: cost
            });
            svcchan.peers.add(self.remoteName);
            ++changes;
        }
        svcchan.handler.peerCosts[self.remoteName] = cost;
    }

    // delete
    names = Object.keys(chan.subChannels);
    for (i = 0; i < names.length; i++) {
        name = names[i];
        svcchan = chan.subChannels[name];
        if (svcchan.handler.type === 'tchannel.relay-handler' &&
            svcchan.peers.get(self.remoteName) &&
            !services[name]) {
            svcchan.logger.info('deleting service peer', {
                serviceName: name,
                hostPort: self.remoteName
            });
            svcchan.peers.delete(self.remoteName);
            delete svcchan.handler.peerCosts[self.remoteName];
            services[name] = null;
            ++changes;
        }
    }

    if (changes) {
        chan.emit('servicesUpdated', self.remoteName, services);
    }
};

TChannelConnection.prototype.start = function start() {
    var self = this;
    if (self.direction === 'out') {
        self.handler.sendInitRequest();
        self.handler.once('init.response', onOutIdentified);
    } else {
        self.handler.once('init.request', onInIdentified);
    }

    function onOutIdentified(init) {
        self.remoteName = init.hostPort;
        self.emit('identified', {
            hostPort: init.hostPort,
            processName: init.processName
        });
        self.advertise();
    }

    function onInIdentified(init) {
        if (init.hostPort === '0.0.0.0:0') {
            self.remoteName = '' + self.socket.remoteAddress + ':' + self.socket.remotePort;
            if (self.remoteName === self.channel.hostPort) {
                throw new Error('EPHEMERAL SELF?');
            }
        } else {
            self.remoteName = init.hostPort;
        }
        self.channel.peers.add(self.remoteName).addConnection(self);
        self.emit('identified', {
            hostPort: self.remoteName,
            processName: init.processName
        });
    }
};

TChannelConnection.prototype.advertise = function advertise() {
    var self = this;
    var chan = self.channel.topChannel || self.channel;
    if (!chan.subChannels) return;
    var names = Object.keys(chan.subChannels);
    var services = {};
    for (var i = 0; i < names.length; i++) {
        var name = names[i];
        var svcchan = chan.subChannels[name];
        switch (svcchan.handler.type) {
            case 'tchannel.endpoint-handler':
                if (svcchan.handler.advertise) {
                    services[name] = {cost: 0};
                }
                break;
            case 'tchannel.relay-handler':
                services[name] = {
                    cost: svcchan.handler.getMinCost() + 1
                };
                break;
        }
    }
    self.logger.debug('advertising', {
        services: services
    });
    self.handler.sendAdvertise(services);
};

TChannelConnection.prototype.close = function close(callback) {
    var self = this;
    if (self.socket.destroyed) {
        callback();
    } else {
        self.socket.once('close', callback);
        self.resetAll(errors.SocketClosedError({reason: 'local close'}));
        self.socket.destroy();
    }
};

TChannelConnection.prototype.onSocketError = function onSocketError(err) {
    var self = this;
    if (!self.closing) {
        self.resetAll(errors.SocketError(err, {
            hostPort: self.channel.hostPort,
            direction: self.direction,
            remoteAddr: self.remoteAddr
        }));
    }
};

TChannelConnection.prototype.buildOutgoingRequest = function buildOutgoingRequest(options) {
    var self = this;
    options = extend({
        logger: self.logger,
        random: self.random,
        timers: self.timers
    }, options);
    return self.handler.buildOutgoingRequest(options);
};

TChannelConnection.prototype.buildOutgoingResponse = function buildOutgoingResponse(req, options) {
    var self = this;
    options = extend({
        logger: self.logger,
        random: self.random,
        timers: self.timers
    }, options);
    return self.handler.buildOutgoingResponse(req, options);
};

module.exports = TChannelConnection;
