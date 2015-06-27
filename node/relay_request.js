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

var inherits = require('util').inherits;

var EventEmitter = require('./lib/event_emitter');
var errors = require('./errors');

function RelayRequest(channel, inreq, buildRes) {
    var self = this;
    EventEmitter.call(self);
    self.finishEvent = self.defineEvent('finish');

    self.channel = channel;
    self.inreq = inreq;
    self.inres = null;
    self.outres = null;
    self.outreq = null;
    self.buildRes = buildRes;
}
inherits(RelayRequest, EventEmitter);

RelayRequest.prototype.createOutRequest = function createOutRequest(host) {
    var self = this;

    if (self.outreq) {
        self.channel.logger.warn('relay request already started', {
            // TODO: better context
            remoteAddr: self.inreq.remoteAddr,
            id: self.inreq.id
        });
        return;
    }

    var elapsed = self.channel.timers.now() - self.inreq.start;
    self.outreq = self.channel.request({
        streamed: self.inreq.streamed,
        timeout: self.inreq.ttl - elapsed,
        host: host,
        parent: self.inreq,
        serviceName: self.inreq.serviceName,
        headers: self.inreq.headers,
        retryFlags: self.inreq.retryFlags
    });
    self.outreq.responseEvent.on(onResponse);
    self.outreq.errorEvent.on(onError);

    if (self.outreq.streamed) {
        // TODO: frame-at-a-time rather than re-streaming?
        self.inreq.arg1.pipe(self.outreq.arg1);
        self.inreq.arg2.pipe(self.outreq.arg2);
        self.inreq.arg3.pipe(self.outreq.arg3);
    } else {
        self.outreq.send(self.inreq.arg1, self.inreq.arg2, self.inreq.arg3);
    }

    return self.outreq;

    function onResponse(res) {
        self.onResponse(res);
    }

    function onError(err) {
        self.onError(err);
    }
};

RelayRequest.prototype.createOutResponse = function createOutResponse(options) {
    var self = this;
    if (self.outres) {
        self.channel.logger.warn('relay request already responded', {
            // TODO: better context
            remoteAddr: self.inreq.remoteAddr,
            id: self.inreq.id
        });
        return;
    }

    // It is possible that the inreq gets reaped with a timeout
    // It is also possible that the out request gets repead with a timeout
    // Both the in & out req try to create an outgoing response
    if (self.inreq.res && self.inreq.res.codeString === 'Timeout') {
        self.channel.logger.debug('relay: in request already timed out', {
            codeString: self.inreq.res.codeString,
            responseMessage: self.inreq.res.message,
            serviceName: self.outreq.serviceName,
            arg1: String(self.outreq.arg1),
            outRemoteAddr: self.outreq.remoteAddr,
            inRemoteAddr: self.inreq.remoteAddr,
            inSocketRemoteAddr: self.inreq.connection.socketRemoteAddr
        });
        return;
    }

    self.outres = self.buildRes(options);
    self.outres.finishEvent.on(emitFinish);
    return self.outres;

    function emitFinish() {
        self.finishEvent.emit(self);
    }
};

RelayRequest.prototype.onResponse = function onResponse(res) {
    var self = this;

    if (self.inres) {
        self.channel.logger.warn('relay request got more than one response callback', {
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
        self.outres.arg1.end();
        self.inres.arg2.pipe(self.outres.arg2);
        self.inres.arg3.pipe(self.outres.arg3);
    } else {
        self.outres.send(self.inres.arg2, self.inres.arg3);
    }
};

RelayRequest.prototype.onError = function onError(err) {
    var self = this;
    if (!self.createOutResponse()) return;
    var codeName = errors.classify(err) || 'UnexpectedError';

    self.outres.sendError(codeName, err.message);
    self.logError(err, codeName);
    // TODO: stat in some cases, e.g. declined / peer not available
};

RelayRequest.prototype.logError = function logError(err, codeName) {
    var self = this;

    var level;
    switch (codeName) {
        case 'ProtocolError':
        case 'UnexpectedError':
            level = 'error';
            break;

        case 'NetworkError':
        case 'Cancelled':
        case 'Declined':
        case 'Busy':
            level = 'warn';
            break;

        case 'BadRequest':
        case 'Timeout':
            level = 'info';
            break;

    }

    if (level === 'error' && err.isErrorFrame) {
        level = 'warn';
    }

    var logger = self.channel.logger;
    var logOptions = {
        error: err,
        isErrorFrame: err.isErrorFrame,
        outRemoteAddr: self.outreq.remoteAddr,
        inRemoteAddr: self.inreq.remoteAddr,
        serviceName: self.outreq.serviceName,
        outArg1: String(self.outreq.arg1)
    };

    if (err.isErrorFrame) {
        if (level === 'warn') {
            logger.warn('forwarding error frame', logOptions);
        } else if (level === 'info') {
            logger.info('forwarding expected error frame', logOptions);
        }
    } else {
        if (level === 'error') {
            logger.error('unexpected error while forwarding', logOptions);
        } else if (level === 'warn') {
            logger.warn('error while forwarding', logOptions);
        } else if (level === 'info') {
            logger.info('expected error while forwarding', logOptions);
        }
    }
};

module.exports = RelayRequest;

