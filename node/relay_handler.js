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

var errors = require('./errors');

RelayHandler.RelayRequest = RelayRequest;

module.exports = RelayHandler;

function RelayHandler(channel, circuits) {
    var self = this;
    self.channel = channel;
    self.circuits = circuits || null;
}

RelayHandler.prototype.type = 'tchannel.relay-handler';

RelayHandler.prototype.handleRequest = function handleRequest(req, buildRes) {
    var self = this;

    if (self.circuits) {
        self._monitorRequest(req, buildRes);
    } else {
        self._handleRequest(req, buildRes);
    }
};

RelayHandler.prototype._monitorRequest = function _monitorRequest(req, buildRes) {
    var self = this;

    // TODO: null-return is error / declined indication... could be clearer
    buildRes = self.circuits.monitorRequest(req, buildRes);
    if (buildRes) {
        self._handleRequest(req, buildRes);
    }
};

RelayHandler.prototype._handleRequest = function _handleRequest(req, buildRes) {
    var self = this;

    // TODO add this back in a performant way ??
    // if (rereq) {
    //     self.channel.logger.error('relay request already exists for incoming request', {
    //         inReqId: req.id,
    //         priorInResId: rereq.inres && rereq.inres.id,
    //         priorOutResId: rereq.outres && rereq.outres.id,
    //         priorOutReqId: rereq.outreq && rereq.outreq.id
    //         // TODO more context, like outreq remote addr
    //     });
    //     buildRes().sendError(
    //         'UnexpectedError', 'request id exists in relay handler'
    //     );
    //     return;
    // }

    req.forwardTrace = true;

    var peer = self.channel.peers.choosePeer(null);
    if (!peer) {
        // TODO: stat
        // TODO: allow for customization of this message so hyperbahn can
        // augment it with things like "at entry node", "at exit node", etc
        buildRes().sendError('Declined', 'no peer available for request');
        self.channel.logger.warn('no relay peer available', req.extendLogInfo({}));
        return;
    }

    var rereq = new RelayRequest(self.channel, peer, req, buildRes);
    rereq.createOutRequest();
};

function RelayRequest(channel, peer, inreq, buildRes) {
    var self = this;

    self.channel = channel;
    self.logger = self.channel.logger;
    self.inreq = inreq;
    self.inres = null;
    self.outres = null;
    self.outreq = null;
    self.buildRes = buildRes;
    self.peer = peer;

    self.error = null;

    self.boundOnError = onError;
    self.boundExtendLogInfo = extendLogInfo;
    self.boundOnIdentified = onIdentified;

    function onError(err) {
        self.onError(err);
    }

    function extendLogInfo(info) {
        return self.extendLogInfo(info);
    }

    function onIdentified(err) {
        if (err) {
            self.onError(err);
        } else {
            self.onIdentified();
        }
    }
}

RelayRequest.prototype.createOutRequest = function createOutRequest() {
    var self = this;

    if (self.outreq) {
        self.logger.warn('relay request already started', {
            // TODO: better context
            remoteAddr: self.inreq.remoteAddr,
            id: self.inreq.id
        });
        return;
    }

    self.peer.waitForIdentified(self.boundOnIdentified);
};

RelayRequest.prototype.onIdentified = function onIdentified() {
    var self = this;

    var conn = chooseRelayPeerConnection(self.peer);
    if (!conn.remoteName) {
        // we get the problem
        self.logger.error('onIdentified called on no connection identified', {
            hostPort: self.peer.hostPort
        });
    }
    if (conn.closing) {
        // most likely
        self.logger.error('onIdentified called on connection closing', {
            hostPort: self.peer.hostPort
        });
    }

    var elapsed = self.channel.timers.now() - self.inreq.start;
    var timeout = Math.max(self.inreq.timeout - elapsed, 1);
    // TODO use a type for this literal
    self.outreq = self.channel.request({
        peer: self.peer,
        streamed: self.inreq.streamed,
        timeout: timeout,
        parent: self.inreq,
        tracing: self.inreq.tracing,
        checksum: self.inreq.checksum,
        forwardTrace: true,
        serviceName: self.inreq.serviceName,
        headers: self.inreq.headers,
        retryFlags: self.inreq.retryFlags
    });
    self.outreq.responseEvent.on(onResponse);
    self.outreq.errorEvent.on(self.boundOnError);

    self.channel.relayLatencyStat.add(elapsed);

    if (self.outreq.streamed) {
        self.outreq.sendStreams(self.inreq.arg1, self.inreq.arg2, self.inreq.arg3);
    } else {
        self.outreq.send(self.inreq.arg1, self.inreq.arg2, self.inreq.arg3);
    }

    function onResponse(res) {
        self.onResponse(res);
    }
};

RelayRequest.prototype.createOutResponse = function createOutResponse(options) {
    var self = this;
    if (self.outres) {
        self.logger.warn('relay request already responded', {
            // TODO: better context
            remoteAddr: self.inreq.remoteAddr,
            id: self.inreq.id,
            options: options,
            error: self.error
        });
        return null;
    }

    // It is possible that the inreq gets reaped with a timeout
    // It is also possible that the out request gets repead with a timeout
    // Both the in & out req try to create an outgoing response
    if (self.inreq.res && self.inreq.res.codeString === 'Timeout') {
        self.logger.debug('relay request already timed out', {
            codeString: self.inreq.res.codeString,
            responseMessage: self.inreq.res.message,
            serviceName: self.outreq && self.outreq.serviceName,
            arg1: self.outreq && String(self.outreq.arg1),
            outRemoteAddr: self.outreq && self.outreq.remoteAddr,
            inRemoteAddr: self.inreq.remoteAddr,
            inSocketRemoteAddr: self.inreq.connection.socketRemoteAddr,
            error: self.error
        });
        return null;
    }

    self.outres = self.buildRes(options);

    return self.outres;
};

RelayRequest.prototype.onResponse = function onResponse(res) {
    var self = this;

    if (self.inres) {
        self.logger.warn('relay request got more than one response callback', {
            // TODO: better context
            remoteAddr: res.remoteAddr,
            id: res.id
        });
        return;
    }
    self.inres = res;

    if (!self.createOutResponse({
        streamed: self.inres.streamed,
        headers: self.inres.headers,
        code: self.inres.code
    })) return;

    if (self.outres.streamed) {
        self.inres.arg2.pipe(self.outres.arg2);
        self.inres.arg3.pipe(self.outres.arg3);
    } else {
        self.outres.send(self.inres.arg2, self.inres.arg3);
    }
};

RelayRequest.prototype.onError = function onError(err) {
    var self = this;

    if (self.error) {
        self.logger.warn('Unexpected double onError', {
            remoteAddr: self.inreq.remoteAddr,
            serviceName: self.inreq.serviceName,
            endpoint: self.inreq.endpoint,
            callerName: self.inreq.headers.cn,

            oldError: self.error,
            error: err
        });
    }
    self.error = err;

    if (!self.createOutResponse()) return;
    var codeName = errors.classify(err) || 'UnexpectedError';

    self.outres.sendError(codeName, err.message);
    self.logError(err, codeName);
};

RelayRequest.prototype.extendLogInfo = function extendLogInfo(info) {
    var self = this;

    info.outRemoteAddr = self.outreq && self.outreq.remoteAddr;
    info = self.inreq.extendLogInfo(info);

    return info;
};

RelayRequest.prototype.logError = function relayRequestLogError(err, codeName) {
    var self = this;
    logError(self.logger, err, codeName, self.boundExtendLogInfo);
};

function logError(logger, err, codeName, extendLogInfo) {
    var level = errors.logLevel(err, codeName);

    var logOptions = extendLogInfo({
        error: err,
        isErrorFrame: err.isErrorFrame
    });

    if (err.isErrorFrame) {
        if (level === 'warn') {
            logger.warn('forwarding error frame', logOptions);
        } else if (level === 'info') {
            logger.info('forwarding expected error frame', logOptions);
        }
    } else if (level === 'error') {
        logger.error('unexpected error while forwarding', logOptions);
    } else if (level === 'warn') {
        logger.warn('error while forwarding', logOptions);
    } else if (level === 'info') {
        logger.info('expected error while forwarding', logOptions);
    }
}

function chooseRelayPeerConnection(peer) {
    var conn = null;
    for (var i = 0; i < peer.connections.length; i++) {
        conn = peer.connections[i];
        if (conn.remoteName && !conn.closing) break;
    }
    return conn;
}
