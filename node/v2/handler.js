// Copyright (c) 2015 Uber Technologies, Inc.

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

var EventEmitter = require('../lib/event_emitter');
var util = require('util');
var assert = require('assert');

var OutRequest = require('./out_request').OutRequest;
var OutResponse = require('./out_response').OutResponse;
var StreamingOutRequest = require('./out_request').StreamingOutRequest;
var StreamingOutResponse = require('./out_response').StreamingOutResponse;
var InRequest = require('../in_request');
var InResponse = require('../in_response');
var States = require('../reqres_states');
var StreamingInRequest = require('../streaming_in_request');
var StreamingInResponse = require('../streaming_in_response');

var v2 = require('./index');
var errors = require('../errors');

var SERVER_TIMEOUT_DEFAULT = 1000;

module.exports = TChannelV2Handler;

function TChannelV2Handler(options) {
    if (!(this instanceof TChannelV2Handler)) {
        return new TChannelV2Handler(options);
    }
    var self = this;
    EventEmitter.call(self);
    self.errorEvent = self.defineEvent('error');
    self.callIncomingErrorEvent = self.defineEvent('callIncomingError');
    self.callIncomingRequestEvent = self.defineEvent('callIncomingRequest');
    self.callIncomingResponseEvent = self.defineEvent('callIncomingResponse');
    self.cancelEvent = self.defineEvent('cancel');
    self.initRequestEvent = self.defineEvent('initRequest');
    self.initResponseEvent = self.defineEvent('initResponse');
    self.claimEvent = self.defineEvent('claim');
    self.pingIncomingRequestEvent = self.defineEvent('pingIncomingRequest');
    self.pingIncomingResponseEvent = self.defineEvent('pingIncomingResponse');
    self.writeErrorEvent = self.defineEvent('writeError'); // TODO: could use default throw behavior

    self.options = options || {};
    self.logger = self.options.logger;
    self.random = self.options.random;
    self.timers = self.options.timers;
    self.tracer = self.options.tracer;
    self.hostPort = self.options.hostPort;
    self.processName = self.options.processName;
    self.connection = self.options.connection;
    self.remoteHostPort = null; // filled in by identify message
    self.lastSentFrameId = 0;
    // TODO: GC these... maybe that's up to TChannel itself wrt ops
    self.streamingReq = Object.create(null);
    self.streamingRes = Object.create(null);
    self.writeBuffer = new Buffer(v2.Frame.MaxSize);
}

util.inherits(TChannelV2Handler, EventEmitter);

TChannelV2Handler.prototype.write = function write() {
    var self = this;
    self.errorEvent.emit(self, new Error('write not implemented'));
};

TChannelV2Handler.prototype.writeCopy = function writeCopy(buffer) {
    var self = this;
    var copy = new Buffer(buffer.length);
    buffer.copy(copy);
    self.write(copy);
};

TChannelV2Handler.prototype.pushFrame = function pushFrame(frame) {
    var self = this;
    var writeBuffer = self.writeBuffer;
    var res = v2.Frame.RW.writeInto(frame, writeBuffer, 0);
    var err = res.err;
    if (err) {
        if (!Buffer.isBuffer(err.buffer)) err.buffer = writeBuffer;
        if (typeof err.offset !== 'number') err.offset = res.offset;
        self.writeErrorEvent.emit(self, err);
    } else {
        var buf = writeBuffer.slice(0, res.offset);
        self.writeCopy(buf);
    }
};

TChannelV2Handler.prototype.nextFrameId = function nextFrameId() {
    var self = this;
    self.lastSentFrameId = (self.lastSentFrameId + 1) % v2.Frame.MaxId;
    return self.lastSentFrameId;
};

TChannelV2Handler.prototype.handleFrame = function handleFrame(frame, callback) {
    var self = this;
    switch (frame.body.type) {
        case v2.Types.InitRequest:
            return self.handleInitRequest(frame, callback);
        case v2.Types.InitResponse:
            return self.handleInitResponse(frame, callback);
        case v2.Types.CallRequest:
            return self.handleCallRequest(frame, callback);
        case v2.Types.CallResponse:
            return self.handleCallResponse(frame, callback);
        case v2.Types.Cancel:
            return self.handleCancel(frame, callback);
        case v2.Types.CallRequestCont:
            return self.handleCallRequestCont(frame, callback);
        case v2.Types.CallResponseCont:
            return self.handleCallResponseCont(frame, callback);
        case v2.Types.Claim:
            return self.handleClaim(frame, callback);
        case v2.Types.PingRequest:
            return self.handlePingRequest(frame, callback);
        case v2.Types.PingResponse:
            return self.handlePingResponse(frame, callback);
        case v2.Types.ErrorResponse:
            return self.handleError(frame, callback);
        default:
            return callback(errors.TChannelUnhandledFrameTypeError({
                typeCode: frame.body.type
            }));
    }
};

TChannelV2Handler.prototype.handleInitRequest = function handleInitRequest(reqFrame, callback) {
    var self = this;
    if (self.remoteHostPort !== null) {
        return callback(errors.DuplicateInitRequestError());
    }
    /* jshint camelcase:false */
    var headers = reqFrame.body.headers;
    var init = {
        hostPort: headers.host_port,
        processName: headers.process_name
    };
    /* jshint camelcase:true */
    self.sendInitResponse(reqFrame);
    self.remoteHostPort = init.hostPort;
    self.initRequestEvent.emit(self, init);
    callback();
};

TChannelV2Handler.prototype.handleInitResponse = function handleInitResponse(resFrame, callback) {
    var self = this;
    if (self.remoteHostPort !== null) {
        return callback(errors.DuplicateInitResponseError());
    }
    /* jshint camelcase:false */
    var headers = resFrame.body.headers;
    var init = {
        hostPort: headers.host_port,
        processName: headers.process_name
    };
    /* jshint camelcase:true */
    self.remoteHostPort = init.hostPort;
    self.initResponseEvent.emit(self, init);
    callback();
};

TChannelV2Handler.prototype.handleCallRequest = function handleCallRequest(reqFrame, callback) {
    var self = this;
    if (self.remoteHostPort === null) {
        return callback(errors.CallReqBeforeInitReqError());
    }

    var req = self.buildInRequest(reqFrame);

    if (!reqFrame.body ||
        !reqFrame.body.headers ||
        !reqFrame.body.headers.as
    ) {
        var err = errors.AsHeaderRequired();
        self.sendErrorFrame(
            req.res, 'ProtocolError', err.message
        );
        return callback();
    }

    if (reqFrame.body.args && reqFrame.body.args[0] &&
        reqFrame.body.args[0].length > v2.CallRequest.MaxArg1Size) {
        req.res = self.buildOutResponse(req);
        self.sendErrorFrame(req.res, 'BadRequest',
            'arg1 exceeds the max size of 0x' +
            v2.CallRequest.MaxArg1Size.toString(16));
        return callback();
    }
    self._handleCallFrame(req, reqFrame, callRequestFrameHandled);
    function callRequestFrameHandled(err) {
        self.callRequestFrameHandled(req, err, callback);
    }
};

TChannelV2Handler.prototype.callRequestFrameHandled = function callRequestFrameHandled(req, err, callback) {
    var self = this;
    if (err) return callback(err);
    if (req.state === States.Streaming) {
        self.streamingReq[req.id] = req;
    }
    self.callIncomingRequestEvent.emit(self, req);
    callback();
};

TChannelV2Handler.prototype.handleCallResponse = function handleCallResponse(resFrame, callback) {
    var self = this;
    if (self.remoteHostPort === null) {
        return callback(errors.CallResBeforeInitResError());
    }
    var res = self.buildInResponse(resFrame);
    if (resFrame.body.args && resFrame.body.args[0] &&
        resFrame.body.args[0].length > v2.CallResponse.MaxArg1Size) {
        return callback(errors.Arg1OverLengthLimit({
                length: '0x' + resFrame.body.args[0].length.toString(16),
                limit: '0x' + v2.CallResponse.MaxArg1Size.toString(16)
        }));
    }
    res.remoteAddr = self.remoteHostPort;
    self._handleCallFrame(res, resFrame, callResponseFrameHandled);
    function callResponseFrameHandled(err) {
        self.callResponseFrameHandled(res, err, callback);
    }
};

TChannelV2Handler.prototype.callResponseFrameHandled = function callResponseFrameHandled(res, err, callback) {
    var self = this;
    if (err) return callback(err);
    if (res.state === States.Streaming) {
        self.streamingRes[res.id] = res;
    }
    self.callIncomingResponseEvent.emit(self, res);
    callback();
};

// TODO  we should implement clearing of self.streaming{Req,Res}
TChannelV2Handler.prototype.handleCancel = function handleCancel(frame, callback) {
    var self = this;
    self.cancelEvent.emit(self, frame);
    callback();
};

TChannelV2Handler.prototype.handleCallRequestCont = function handleCallRequestCont(reqFrame, callback) {
    var self = this;
    if (self.remoteHostPort === null) {
        return callback(errors.CallReqContBeforeInitReqError());
    }
    var id = reqFrame.id;
    var req = self.streamingReq[id];
    if (!req) {
        return callback(new Error('call request cont for unknown request')); // TODO typed error
    }
    self._handleCallFrame(req, reqFrame, callback);
};

TChannelV2Handler.prototype.handleCallResponseCont = function handleCallResponseCont(resFrame, callback) {
    var self = this;
    if (self.remoteHostPort === null) {
        return callback(errors.CallResContBeforeInitResError());
    }
    var id = resFrame.id;
    var res = self.streamingRes[id];
    if (!res) {
        return callback(new Error('call response cont for unknown response')); // TODO typed error
    }
    self._handleCallFrame(res, resFrame, callback);
};

TChannelV2Handler.prototype.handleClaim = function handleClaim(frame, callback) {
    var self = this;
    self.claimEvent.emit(self, frame);
    callback();
};

TChannelV2Handler.prototype.handlePingRequest = function handlePingRequest(pingFrame, callback) {
    var self = this;
    self.pingIncomingRequestEvent.emit(self, pingFrame);
    self.sendPingReponse(pingFrame);
    callback();
};

TChannelV2Handler.prototype.handlePingResponse = function handlePingResponse(pingFrame, callback) {
    var self = this;
    self.pingIncomingResponseEvent.emit(self, pingFrame);
    callback();
};

TChannelV2Handler.prototype.handleError = function handleError(errFrame, callback) {
    var self = this;

    var id = errFrame.id;
    var code = errFrame.body.code;
    var message = String(errFrame.body.message);
    var err = v2.ErrorResponse.CodeErrors[code]({
        originalId: id,
        message: message
    });
    if (id === v2.Frame.NullId) {
        // fatal error not associated with a prior frame
        callback(err);
    } else {
        self.callIncomingErrorEvent.emit(self, err);
        callback();
    }
};

TChannelV2Handler.prototype._handleCallFrame = function _handleCallFrame(r, frame, callback) {
    var self = this;
    if (r.state === States.Done) {
        callback(new Error('got cont in done state')); // TODO typed error
        return;
    }

    var checksum = r.checksum;
    if (checksum.type !== frame.body.csum.type) {
        callback(new Error('checksum type changed mid-stream')); // TODO typed error
        return;
    }

    var err = frame.body.verifyChecksum(checksum.val);
    if (err) {
        callback(err); // TODO wrap context
        return;
    }
    r.checksum = frame.body.csum;

    var isLast = !(frame.body.flags & v2.CallFlags.Fragment);
    r.handleFrame(frame.body.args);
    if (isLast) {
        r.handleFrame(null);
        r.state = States.Done;
    } else if (r.state === States.Initial) {
        r.state = States.Streaming;
    } else if (r.state !== States.Streaming) {
        self.errorEvent.emit(self, new Error('unknown frame handling state'));
    }
    callback();
};

TChannelV2Handler.prototype.sendInitRequest = function sendInitRequest() {
    var self = this;
    var id = self.nextFrameId(); // TODO: assert(id === 1)?
    var hostPort = self.hostPort || '0.0.0.0:0';
    var processName = self.processName;
    var body = new v2.InitRequest(v2.VERSION, {
        /* jshint camelcase:false */
        host_port: hostPort,
        process_name: processName
        /* jshint camelcase:true */
    });
    var reqFrame = new v2.Frame(id, body);
    self.pushFrame(reqFrame);
};

TChannelV2Handler.prototype.sendInitResponse = function sendInitResponse(reqFrame) {
    var self = this;
    var id = reqFrame.id;
    var hostPort = self.hostPort;
    var processName = self.processName;
    var body = new v2.InitResponse(v2.VERSION, {
        /* jshint camelcase:false */
        host_port: hostPort,
        process_name: processName
        /* jshint camelcase:true */
    });
    var resFrame = new v2.Frame(id, body);
    self.pushFrame(resFrame);
};

TChannelV2Handler.prototype.sendCallRequestFrame = function sendCallRequestFrame(req, flags, args) {
    var self = this;
    if (self.remoteHostPort === null) {
        self.errorEvent.emit(self, errors.SendCallReqBeforeIdentifiedError());
        return;
    }
    var reqBody = new v2.CallRequest(
        flags, req.ttl, req.tracing, req.serviceName, req.headers,
        req.checksum.type, args);

    assert(req.headers && req.headers.as,
        'Expected the "as" transport header to be set');

    req.checksum = self._sendCallBodies(req.id, reqBody, null);
};

TChannelV2Handler.prototype.sendCallResponseFrame = function sendCallResponseFrame(res, flags, args) {
    var self = this;
    if (self.remoteHostPort === null) {
        self.errorEvent.emit(self, errors.SendCallResBeforeIdentifiedError());
        return;
    }
    var code = res.ok ? v2.CallResponse.Codes.OK : v2.CallResponse.Codes.Error;
    var resBody = new v2.CallResponse(
        flags, code, res.tracing, res.headers,
        res.checksum.type, args);
    res.checksum = self._sendCallBodies(res.id, resBody, null);
};

TChannelV2Handler.prototype.sendCallRequestContFrame = function sendCallRequestContFrame(req, flags, args) {
    var self = this;
    if (self.remoteHostPort === null) {
        self.errorEvent.emit(self, errors.SendCallReqContBeforeIdentifiedError());
        return;
    }
    var reqBody = new v2.CallRequestCont(flags, req.checksum.type, args);
    req.checksum = self._sendCallBodies(req.id, reqBody, req.checksum);
};

TChannelV2Handler.prototype.sendCallResponseContFrame = function sendCallResponseContFrame(res, flags, args) {
    var self = this;
    if (self.remoteHostPort === null) {
        self.errorEvent.emit(self, errors.SendCallResContBeforeIdentifiedError());
        return;
    }
    var resBody = new v2.CallResponseCont(flags, res.checksum.type, args);
    res.checksum = self._sendCallBodies(res.id, resBody, res.checksum);
};

TChannelV2Handler.prototype._sendCallBodies = function _sendCallBodies(id, body, checksum) {
    var self = this;
    var frame;

    // jshint boss:true
    do {
        if (checksum) body.csum = checksum;
        frame = new v2.Frame(id, body);
        self.pushFrame(frame);
        checksum = body.csum;
    } while (body = body.cont);
    return checksum;
};

TChannelV2Handler.prototype.sendPingRequest = function sendPingRequest() {
    var self = this;
    var id = self.nextFrameId();
    var body = new v2.PingRequest();
    var reqFrame = new v2.Frame(id, body);
    self.pushFrame(reqFrame);
    return id;
};

TChannelV2Handler.prototype.sendPingReponse = function sendPingReponse(res) {
    var self = this;
    var body = new v2.PingResponse();
    var resFrame = new v2.Frame(res.id, body);
    self.pushFrame(resFrame);
};

TChannelV2Handler.prototype.sendErrorFrame = function sendErrorFrame(r, codeString, message) {
    var self = this;
    var code = v2.ErrorResponse.Codes[codeString];
    if (code === undefined) {
        self.logger.error('invalid error frame code string', {
            codeString: codeString
        });
        code = v2.ErrorResponse.Codes.UnexpectedError;
        message = 'UNKNOWN CODE(' + codeString + '): ' + message;
    }
    var errBody = new v2.ErrorResponse(code, r.tracing, message);
    var errFrame = new v2.Frame(r.id, errBody);
    self.pushFrame(errFrame);
};

TChannelV2Handler.prototype.buildOutRequest = function buildOutRequest(options) {
    var self = this;
    var id = self.nextFrameId();
    if (options.checksumType === undefined || options.checksumType === null) {
        options.checksumType = v2.Checksum.Types.CRC32C;
    }
    options.checksum = new v2.Checksum(options.checksumType);
    if (!options.headers) options.headers = {};
    options.headers.re = v2.encodeRetryFlags(options.retryFlags);
    if (options.streamed) {
        return new StreamingOutRequest(self, id, options);
    } else {
        return new OutRequest(self, id, options);
    }
};

TChannelV2Handler.prototype.buildOutResponse = function buildOutResponse(req, options) {
    var self = this;
    if (!options) options = {};
    options.tracing = req.tracing;
    options.span = req.span;
    options.checksumType = req.checksum.type;
    options.checksum = new v2.Checksum(req.checksum.type);
    if (options.streamed) {
        return new StreamingOutResponse(self, req.id, options);
    } else {
        return new OutResponse(self, req.id, options);
    }
};

TChannelV2Handler.prototype.buildInRequest = function buildInRequest(reqFrame) {
    var self = this;
    var retryFlags = v2.parseRetryFlags(reqFrame.body.headers.re);
    var opts = {
        logger: self.logger,
        random: self.random,
        timers: self.timers,
        tracer: self.tracer,
        ttl: reqFrame.body.ttl || SERVER_TIMEOUT_DEFAULT,
        tracing: reqFrame.body.tracing,
        serviceName: reqFrame.body.service,
        headers: reqFrame.body.headers,
        retryFlags: retryFlags,
        checksum: new v2.Checksum(reqFrame.body.csum.type),
        streamed: reqFrame.body.flags & v2.CallFlags.Fragment,
        hostPort: self.hostPort, // needed for tracing
        connection: self.connection
    };
    if (opts.streamed) {
        return new StreamingInRequest(reqFrame.id, opts);
    } else {
        return new InRequest(reqFrame.id, opts);
    }
};

TChannelV2Handler.prototype.buildInResponse = function buildInResponse(resFrame) {
    var self = this;
    var opts = {
        logger: self.logger,
        random: self.random,
        timers: self.timers,
        code: resFrame.body.code,
        checksum: new v2.Checksum(resFrame.body.csum.type),
        streamed: resFrame.body.flags & v2.CallFlags.Fragment,
        headers: resFrame.body.headers
    };
    if (opts.streamed) {
        return new StreamingInResponse(resFrame.id, opts);
    } else {
        return new InResponse(resFrame.id, opts);
    }
};
