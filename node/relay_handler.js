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

    buildRes = self.circuits.monitorRequest(req, buildRes);
    self._handleRequest(req, buildRes);
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
    var rereq = new RelayRequest(self.channel, req, buildRes);

    rereq.createOutRequest();
};

function RelayRequest(channel, inreq, buildRes) {
    var self = this;

    self.channel = channel;
    self.logger = self.channel.logger;
    self.inreq = inreq;
    self.inres = null;
    self.outres = null;
    self.outreq = null;
    self.buildRes = buildRes;
    self.peer = null;

    self.error = null;
}

RelayRequest.prototype.createOutRequest = function createOutRequest(host) {
    var self = this;

    if (self.outreq) {
        self.logger.warn('relay request already started', {
            // TODO: better context
            remoteAddr: self.inreq.remoteAddr,
            id: self.inreq.id
        });
        return;
    }

    if (self.peer) {
        self.logger.error('createOutRequest: overwritting peers', {
            hostPort: self.peer.hostPort
        });
    }

    if (host) {
        self.peer = self.channel.peers.add(host);
    } else {
        self.peer = self.channel.peers.choosePeer(null);
    }

    if (!self.peer) {
        self.onError(errors.NoPeerAvailable());
        return;
    }

    self.peer.waitForIdentified(onIdentified);

    function onIdentified(err) {
        self.onIdentified(err);
    }
};

RelayRequest.prototype.onIdentified = function onIdentified(err1) {
    var self = this;

    if (err1) {
        self.onError(err1);
        return;
    }

    var identified = false;
    var closing = false;
    for (var i = 0; i < self.peer.connections.length; i++) {
        if (self.peer.connections[i].remoteName) {
            identified = true;
            closing = self.peer.connections[i].closing;
            if (!closing) break;
        }
    }

    if (!identified) {
        // we get the problem
        self.logger.error('onIdentified called on no connection identified', {
            hostPort: self.peer.hostPort
        });
    }

    if (closing) {
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
    self.outreq.errorEvent.on(onError);

    if (self.outreq.streamed) {
        self.outreq.sendStreams(self.inreq.arg1, self.inreq.arg2, self.inreq.arg3);
    } else {
        self.outreq.send(self.inreq.arg1, self.inreq.arg2, self.inreq.arg3);
    }

    function onResponse(res) {
        self.onResponse(res);
    }

    function onError(err2) {
        self.onError(err2);
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
    // TODO: stat in some cases, e.g. declined / peer not available
};

RelayRequest.prototype.logError = function logError(err, codeName) {
    var self = this;

    var level = errorLogLevel(err, codeName);

    var logOptions = {
        error: err,
        isErrorFrame: err.isErrorFrame,
        outRemoteAddr: self.outreq && self.outreq.remoteAddr,
        inRemoteAddr: self.inreq.remoteAddr,
        serviceName: self.inreq.serviceName,
        outArg1: String(self.inreq.arg1)
    };

    if (err.isErrorFrame) {
        if (level === 'warn') {
            self.logger.warn('forwarding error frame', logOptions);
        } else if (level === 'info') {
            self.logger.info('forwarding expected error frame', logOptions);
        }
    } else if (level === 'error') {
        self.logger.error('unexpected error while forwarding', logOptions);
    } else if (level === 'warn') {
        self.logger.warn('error while forwarding', logOptions);
    } else if (level === 'info') {
        self.logger.info('expected error while forwarding', logOptions);
    }
};

function errorLogLevel(err, codeName) {
    switch (codeName) {
        case 'ProtocolError':
        case 'UnexpectedError':
            if (err.isErrorFrame) {
                return 'warn';
            }
            return 'error';

        case 'NetworkError':
        case 'Cancelled':
        case 'Declined':
        case 'Busy':
            return 'warn';

        case 'BadRequest':
        case 'Timeout':
            return 'info';

        default:
            return 'error';
    }
}
