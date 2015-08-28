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
var stat = require('../lib/stat.js');
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

var SERVER_TIMEOUT_DEFAULT = 100;

/* jshint maxparams:10 */

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
    self.remoteName = null; // filled in by identify message
    self.lastSentFrameId = 0;
    // TODO: GC these... maybe that's up to TChannel itself wrt ops
    self.streamingReq = Object.create(null);
    self.streamingRes = Object.create(null);
    self.writeBuffer = new Buffer(v2.Frame.MaxSize);

    self.handleCallLazily = self.options.handleCallLazily || null;
    self.handleFrame = self.handleEagerFrame;

    self.requireAs = self.options.requireAs === false ? false : true;
    self.requireCn = self.options.requireCn === false ? false : true;
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

TChannelV2Handler.prototype.useLazyFrames = function useLazyFrames(enabled) {
    var self = this;

    if (enabled) {
        self.handleFrame = self.handleLazyFrame;
    } else {
        self.handleFrame = self.handleEagerFrame;
    }
};

TChannelV2Handler.prototype.handleLazyFrame = function handleLazyFrame(frame) {
    var self = this;

    switch (frame.type) {
        // TODO: make some lazy type handlers?
        // case v2.Types.InitRequest:
        // case v2.Types.InitResponse:
        // case v2.Types.Cancel:
        // case v2.Types.Claim:
        // case v2.Types.PingRequest:
        // case v2.Types.PingResponse:

        case v2.Types.CallRequest:
        case v2.Types.CallResponse:
        case v2.Types.CallRequestCont:
        case v2.Types.CallResponseCont:
        case v2.Types.ErrorResponse:
            if (self.handleCallLazily && self.handleCallLazily(frame)) {
                return;
            }
            break;
    }

    var res = frame.readBody();
    if (res.err) {
        self.errorEvent.emit(res.err);
        return;
    }

    self.handleEagerFrame(frame);
};

TChannelV2Handler.prototype.handleEagerFrame = function handleEagerFrame(frame) {
    var self = this;
    switch (frame.body.type) {
        case v2.Types.InitRequest:
            return self.handleInitRequest(frame);
        case v2.Types.InitResponse:
            return self.handleInitResponse(frame);
        case v2.Types.CallRequest:
            return self.handleCallRequest(frame);
        case v2.Types.CallResponse:
            return self.handleCallResponse(frame);
        case v2.Types.Cancel:
            return self.handleCancel(frame);
        case v2.Types.CallRequestCont:
            return self.handleCallRequestCont(frame);
        case v2.Types.CallResponseCont:
            return self.handleCallResponseCont(frame);
        case v2.Types.Claim:
            return self.handleClaim(frame);
        case v2.Types.PingRequest:
            return self.handlePingRequest(frame);
        case v2.Types.PingResponse:
            return self.handlePingResponse(frame);
        case v2.Types.ErrorResponse:
            return self.handleError(frame);
        default:
            return self.errorEvent.emit(self, errors.TChannelUnhandledFrameTypeError({
                typeCode: frame.body.type
            }));
    }
};

TChannelV2Handler.prototype.handleInitRequest = function handleInitRequest(reqFrame) {
    var self = this;
    if (self.remoteName !== null) {
        return self.errorEvent.emit(self, errors.DuplicateInitRequestError());
    }
    /* jshint camelcase:false */
    var headers = reqFrame.body.headers;
    var init = {
        hostPort: headers.host_port,
        processName: headers.process_name
    };
    /* jshint camelcase:true */
    self.sendInitResponse(reqFrame);
    self.remoteName = init.hostPort;
    self.initRequestEvent.emit(self, init);
};

TChannelV2Handler.prototype.handleInitResponse = function handleInitResponse(resFrame) {
    var self = this;
    if (self.remoteName !== null) {
        return self.errorEvent.emit(self, errors.DuplicateInitResponseError());
    }
    /* jshint camelcase:false */
    var headers = resFrame.body.headers;
    var init = {
        hostPort: headers.host_port,
        processName: headers.process_name
    };
    /* jshint camelcase:true */
    self.remoteName = init.hostPort;
    self.initResponseEvent.emit(self, init);
};

TChannelV2Handler.prototype.handleCallRequest = function handleCallRequest(reqFrame) {
    var self = this;

    if (self.remoteName === null) {
        self.errorEvent.emit(self, errors.CallReqBeforeInitReqError());
        return;
    }

    var req = self.buildInRequest(reqFrame);

    var err = self.checkCallReqFrame(reqFrame);
    if (err) {
        req.errorEvent.emit(req, err);
        return;
    }

    if (self._handleCallFrame(req, reqFrame, self.streamingReq)) {
        self.callIncomingRequestEvent.emit(self, req);
    }

    var channel = self.connection.channel;
    channel.emitFastStat(channel.buildStat(
        'tchannel.inbound.request.size',
        'counter',
        reqFrame.size,
        new stat.InboundRequestSizeTags(
            req.headers.cn,
            req.serviceName,
            req.endpoint
        )
    ));

    self.emitBytesRecvd(reqFrame);
};

TChannelV2Handler.prototype.emitBytesRecvd =
function emitBytesRecvd(frame) {
    var self = this;

    var channel = self.connection.channel;
    if (channel.emitConnectionMetrics) {
        channel.emitFastStat(channel.buildStat(
            'tchannel.connections.bytes-recvd',
            'counter',
            frame.size,
            new stat.ConnectionsBytesRcvdTags(
                channel.hostPort || '0.0.0.0:0',
                self.connection.socketRemoteAddr
            )
        ));
    }
};

TChannelV2Handler.prototype.checkCallResFrame = function checkCallResFrame(resFrame) {
    var self = this;

    if (!resFrame.body ||
        !resFrame.body.headers ||
        !resFrame.body.headers.as
    ) {
        if (self.requireAs) {
            return errors.InAsHeaderRequired({
                frame: 'response'
            });
        } else {
            self.logger.warn('Expected "as" for incoming response', {
                code: resFrame.body.code,
                remoteName: self.remoteName,
                endpoint: String(resFrame.body.args[0]),
                socketRemoteAddr: self.connection.socketRemoteAddr
            });
        }
    }

    return self.checkCallFrameArgs(resFrame);
};

TChannelV2Handler.prototype.checkCallReqFrame = function checkCallReqFrame(reqFrame) {
    var self = this;

    if (!reqFrame.body ||
        !reqFrame.body.headers ||
        !reqFrame.body.headers.as
    ) {
        if (self.requireAs) {
            return errors.InAsHeaderRequired({
                frame: 'request'
            });
        } else {
            self.logger.warn('Expected "as" header for incoming req', {
                arg1: String(reqFrame.body.args[0]),
                serviceName: reqFrame.body.service,
                callerName: reqFrame.body.headers.cn,
                remoteName: self.remoteName,
                socketRemoteAddr: self.connection.socketRemoteAddr
            });
        }
    }

    if (!reqFrame.body ||
        !reqFrame.body.headers ||
        !reqFrame.body.headers.cn
    ) {
        if (self.requireCn) {
            return errors.InCnHeaderRequired();
        } else {
            self.logger.warn('Expected "cn" header for incoming req', {
                arg1: String(reqFrame.body.args[0]),
                serviceName: reqFrame.body.service,
                remoteName: self.remoteName,
                socketRemoteAddr: self.connection.socketRemoteAddr
            });
        }
    }

    return self.checkCallFrameArgs(reqFrame);
};

TChannelV2Handler.prototype.checkCallFrameArgs = function checkCallFrameArgs(frame) {
    if (frame.body.args &&
        frame.body.args[0] &&
        frame.body.args[0].length > v2.MaxArg1Size
    ) {
        return errors.Arg1OverLengthLimit({
            length: frame.body.args[0].length,
            limit: v2.MaxArg1Size
        });
    }

    return null;
};

TChannelV2Handler.prototype.handleCallResponse = function handleCallResponse(resFrame) {
    var self = this;

    if (self.remoteName === null) {
        self.errorEvent.emit(self, errors.CallResBeforeInitResError());
        return;
    }

    var res = self.buildInResponse(resFrame);

    var err = self.checkCallResFrame(resFrame);
    if (err) {
        res.errorEvent.emit(res, err);
        return;
    }

    var req = self.connection.ops.getOutReq(res.id);

    var channel = self.connection.channel;

    channel.emitFastStat(channel.buildStat(
        'tchannel.inbound.response.size',
        'counter',
        resFrame.size,
        new stat.InboundResponseSizeTags(
            req ? req.headers.cn : '',
            req ? req.serviceName : '',
            req ? req.endpoint : ''
        )
    ));

    self.emitBytesRecvd(resFrame);

    res.remoteAddr = self.remoteName;
    if (self._handleCallFrame(res, resFrame, self.streamingRes)) {
        self.callIncomingResponseEvent.emit(self, res);
    }
};


// TODO  we should implement clearing of self.streaming{Req,Res}
TChannelV2Handler.prototype.handleCancel = function handleCancel(frame) {
    var self = this;
    self.cancelEvent.emit(self, frame);
};

TChannelV2Handler.prototype.handleCallRequestCont = function handleCallRequestCont(reqFrame, callback) {
    var self = this;
    if (self.remoteName === null) {
        return self.errorEvent.emit(self, errors.CallReqContBeforeInitReqError());
    }
    var id = reqFrame.id;
    var req = self.streamingReq[id];
    if (!req) {
        // TODO: maybe we should send an error frame directed at the missing
        // request id?  Currently the handler -> connection boundary only
        // supports "close them all" error handling.  If instead we added an
        // option for errors classified as 'BadRequest' to resolve through
        // something like `var refId = errors.badRequestRefId(err); if (refId
        // !== undefined) ...` then we could support it.
        return self.errorEvent.emit(self, errors.OrphanCallRequestCont({
            frameId: id
        }));
    }

    self._handleCallFrame(req, reqFrame, self.streamingReq);

    var channel = self.connection.channel;
    channel.emitFastStat(channel.buildStat(
        'tchannel.inbound.request.size',
        'counter',
        reqFrame.size,
        new stat.InboundRequestSizeTags(
            req.headers.cn,
            req.serviceName,
            req.endpoint
        )
    ));

    self.emitBytesRecvd(reqFrame);
};

TChannelV2Handler.prototype.handleCallResponseCont = function handleCallResponseCont(resFrame) {
    var self = this;
    if (self.remoteName === null) {
        return self.errorEvent.emit(self, errors.CallResContBeforeInitResError());
    }
    var id = resFrame.id;
    var res = self.streamingRes[id];
    if (!res) {
        // TODO: see note in #handleCallRequestCont
        return self.errorEvent.emit(self, errors.OrphanCallResponseCont({
            frameId: id
        }));
    }

    var req = self.connection.ops.getOutReq(res.id);
    var channel = self.connection.channel;

    channel.emitFastStat(channel.buildStat(
        'tchannel.inbound.response.size',
        'counter',
        resFrame.size,
        new stat.InboundResponseSizeTags(
            req ? req.headers.cn : '',
            req ? req.serviceName : '',
            req ? req.endpoint : ''
        )
    ));

    self.emitBytesRecvd(resFrame);

    self._handleCallFrame(res, resFrame, self.streamingRes);
};

TChannelV2Handler.prototype.handleClaim = function handleClaim(frame) {
    var self = this;
    self.claimEvent.emit(self, frame);
};

TChannelV2Handler.prototype.handlePingRequest = function handlePingRequest(pingFrame) {
    var self = this;
    self.pingIncomingRequestEvent.emit(self, pingFrame);
    self.sendPingReponse(pingFrame);
};

TChannelV2Handler.prototype.handlePingResponse = function handlePingResponse(pingFrame) {
    var self = this;
    self.pingIncomingResponseEvent.emit(self, pingFrame);
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

    delete self.streamingReq[id];
    delete self.streamingRes[id];

    if (id === v2.Frame.NullId) {
        // fatal error not associated with a prior frame
        self.errorEvent.emit(self, err);
    } else {
        self.callIncomingErrorEvent.emit(self, err);
    }
};

TChannelV2Handler.prototype._checkCallFrame = function _checkCallFrame(r, frame) {
    // TODO: this obsoletes similar checks in StreamingIn{Request,Response}#handleFrame
    if (r.state === States.Done) {
        return errors.UnexpectedCallFrameAfterDone({
            frameId: frame.id,
            frameType: frame.body.type
        });
    } else if (r.state === States.Error) {
        return errors.UnexpectedCallFrameAfterError({
            frameId: frame.id,
            frameType: frame.body.type
        });
    }

    var checksum = r.checksum;
    if (checksum.type !== frame.body.csum.type) {
        return errors.ChecksumTypeChanged({
            initialChecksumType: checksum.type,
            newChecksumType: frame.body.csum.type
        });
    }

    return frame.body.verifyChecksum(checksum.val);
};

TChannelV2Handler.prototype._handleCallFrame = function _handleCallFrame(r, frame, streamingColl) {
    var self = this;

    var isLast = true;
    var err = self._checkCallFrame(r, frame);

    if (!err) {
        // TODO: refactor r.handleFrame to just take the whole frame? or should
        // it be (checksum, args)
        isLast = !(frame.body.flags & v2.CallFlags.Fragment);
        r.checksum = frame.body.csum;
        err = r.handleFrame(frame.body.args, isLast);
    }

    if (err) {
        // TODO wrap context
        r.errorEvent.emit(r, err);
        delete streamingColl[r.id];
        return false;
    }

    if (isLast) {
        delete streamingColl[r.id];
    } else if (!streamingColl[r.id]) {
        streamingColl[r.id] = r;
    } else {
        assert(streamingColl[r.id] === r);
    }

    return true;
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

TChannelV2Handler.prototype.sendCallRequestFrame =
function sendCallRequestFrame(req, flags, args) {
    var self = this;
    if (self.remoteName === null) {
        self.errorEvent.emit(self, errors.SendCallReqBeforeIdentifiedError());
        return null;
    }

    var err = self.verifyCallRequestFrame(req, args);
    if (err) {
        return err;
    }

    var reqBody = new v2.CallRequest(
        flags, req.timeout, req.tracing, req.serviceName, req.headers,
        req.checksum.type, args
    );
    req.checksum = self.sendCallBodies(
        req.id, reqBody, null,
        'tchannel.outbound.request.size', new stat.OutboundRequestSizeTags(
            req.serviceName,
            req.headers.cn,
            req.endpoint
        ));

    return null;
};

TChannelV2Handler.prototype.emitBytesSent =
function emitBytesSent(size) {
    var self = this;

    var channel = self.connection.channel;
    if (channel.emitConnectionMetrics) {
        channel.emitFastStat(channel.buildStat(
            'tchannel.connections.bytes-sent',
            'counter',
            size,
            new stat.ConnectionsBytesSentTags(
                channel.hostPort || '0.0.0.0:0',
                self.connection.socketRemoteAddr
            )
        ));
    }
};

TChannelV2Handler.prototype.verifyCallRequestFrame =
function verifyCallRequestFrame(req, args) {
    var self = this;

    if (!req.headers || !req.headers.as) {
        if (self.requireAs) {
            return errors.OutAsHeaderRequired();
        } else {
            self.logger.error('Expected "as" header to be set for request', {
                arg1: req.endpoint,
                callerName: req.headers && req.headers.cn,
                remoteName: self.remoteName,
                serviceName: req.serviceName,
                socketRemoteAddr: self.connection.socketRemoteAddr
            });
        }
    }

    if (!req.headers || !req.headers.cn) {
        if (self.requireCn) {
            return errors.OutCnHeaderRequired();
        } else {
            self.logger.error('Expected "cn" header to be set for request', {
                arg1: req.endpoint,
                remoteName: self.remoteName,
                serviceName: req.serviceName,
                socketRemoteAddr: self.connection.socketRemoteAddr
            });
        }
    }

    return null;
};

TChannelV2Handler.prototype.sendCallResponseFrame =
function sendCallResponseFrame(res, flags, args) {
    var self = this;
    if (self.remoteName === null) {
        self.errorEvent.emit(self, errors.SendCallResBeforeIdentifiedError());
        return;
    }

    var err = self.validateCallResponseFrame(res);
    if (err) {
        return err;
    }

    var code = res.ok ? v2.CallResponse.Codes.OK : v2.CallResponse.Codes.Error;
    var req = res.inreq;
    var resBody = new v2.CallResponse(
        flags, code, res.tracing, res.headers,
        res.checksum.type, args);
    res.checksum = self.sendCallBodies(
        res.id, resBody, null,
        'tchannel.outbound.response.size', new stat.OutboundResponseSizeTags(
            req.serviceName,
            req.headers.cn,
            req.endpoint
        ));
};

TChannelV2Handler.prototype.validateCallResponseFrame =
function validateCallResponseFrame(res) {
    var self = this;

    if (self.requireAs) {
        // TODO: consider returning typed error like for req frame validate
        assert(res.headers && res.headers.as,
            'Expected the "as" transport header to be set for response');
    } else if (!res.headers || !res.headers.as) {
        self.logger.error('Expected "as" header to be set for response', {
            code: res.code,
            remoteName: self.remoteName,
            arg1: self.inreq.endpoint,
            socketRemoteAddr: self.connection.socketRemoteAddr
        });
    }

    return null;
};

TChannelV2Handler.prototype.sendCallRequestContFrame = function sendCallRequestContFrame(req, flags, args) {
    var self = this;
    if (self.remoteName === null) {
        self.errorEvent.emit(self, errors.SendCallReqContBeforeIdentifiedError());
        return;
    }

    var reqBody = new v2.CallRequestCont(flags, req.checksum.type, args);
    req.checksum = self.sendCallBodies(
        req.id, reqBody, req.checksum,
        'tchannel.outbound.request.size', new stat.OutboundRequestSizeTags(
            req ? req.serviceName : '',
            req ? req.headers.cn : '',
            req ? req.endpoint : ''
        ));
};

TChannelV2Handler.prototype.sendCallResponseContFrame = function sendCallResponseContFrame(res, flags, args) {
    var self = this;
    if (self.remoteName === null) {
        self.errorEvent.emit(self, errors.SendCallResContBeforeIdentifiedError());
        return;
    }

    var req = res.inreq;
    var resBody = new v2.CallResponseCont(flags, res.checksum.type, args);
    res.checksum = self.sendCallBodies(
        res.id, resBody, res.checksum,
        'tchannel.outbound.response.size', new stat.OutboundResponseSizeTags(
            req.serviceName,
            req.headers.cn,
            req.endpoint
        ));
};

TChannelV2Handler.prototype.sendCallBodies =
function sendCallBodies(id, body, checksum, chanStat, tags) {
    var self = this;
    var channel = self.connection.channel;
    var frame;

    var size = 0;
    // jshint boss:true
    do {
        if (checksum) {
            body.csum = checksum;
        }

        frame = new v2.Frame(id, body);
        self.pushFrame(frame);
        size += frame.size;
        checksum = body.csum;
    } while (body = body.cont);

    if (chanStat) {
        var stat = channel.buildStat(chanStat, 'counter', size, tags);
        channel.emitFastStat(stat);
    }
    self.emitBytesSent(size);

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

    if (options.checksumType === null) {
        options.checksumType = v2.Checksum.Types.CRC32C;
    }
    if (!options.checksum) {
        options.checksum = new v2.Checksum(options.checksumType);
    }
    if (!options.headers.re) {
        options.headers.re = v2.encodeRetryFlags(options.retryFlags);
    }

    if (options.streamed) {
        return new StreamingOutRequest(self, id, options);
    } else {
        return new OutRequest(self, id, options);
    }
};

TChannelV2Handler.prototype.buildOutResponse = function buildOutResponse(req, options) {
    var self = this;
    if (!options) options = {};

    options.inreq = req;
    options.channel = req.channel;
    options.logger = self.logger;
    options.random = self.random;
    options.timers = self.timers;

    options.tracing = req.tracing;
    options.span = req.span;
    options.checksumType = req.checksum.type;
    if (!options.checksum) {
        options.checksum = new v2.Checksum(req.checksum.type);
    }
    if (options.streamed) {
        return new StreamingOutResponse(self, req.id, options);
    } else {
        return new OutResponse(self, req.id, options);
    }
};

TChannelV2Handler.prototype.buildInRequest = function buildInRequest(reqFrame) {
    var self = this;

    var opts = new InRequestOptions(
        self.connection.channel,
        reqFrame.body.ttl || SERVER_TIMEOUT_DEFAULT,
        reqFrame.body.tracing,
        reqFrame.body.service,
        reqFrame.body.headers,
        new v2.Checksum(reqFrame.body.csum.type),
        v2.parseRetryFlags(reqFrame.body.headers.re),
        self.connection,
        self.hostPort,
        self.tracer
    );

    var req;
    if (reqFrame.body.flags & v2.CallFlags.Fragment) {
        req = new StreamingInRequest(reqFrame.id, opts);
    } else {
        req = new InRequest(reqFrame.id, opts);
    }

    req.errorEvent.on(onReqError);

    function onReqError(err) {
        self.onReqError(err, req);
    }

    return req;
};

TChannelV2Handler.prototype.onReqError = function onReqError(err, req) {
    var self = this;

    var codeName = errors.classify(err);
    if (codeName &&
        codeName !== 'ProtocolError'
    ) {
        // TODO: move req to error state?
        if (!req.res) {
            req.res = self.buildOutResponse(req);
        }
        req.res.sendError(codeName, err.message);
    } else {
        self.errorEvent.emit(self, err);
    }
};

TChannelV2Handler.prototype.onResError = function onResError(err, res) {
    var self = this;

    // TODO: wrap errors to clarify "errors on responses to req..." ?
    var req = self.connection.ops.getOutReq(res.id);
    req.errorEvent.emit(req, err);
};

/*jshint maxparams:10*/
function InRequestOptions(
    channel, timeout, tracing, serviceName, headers, checksum,
    retryFlags, connection, hostPort, tracer
) {
    var self = this;

    self.channel = channel;
    self.timeout = timeout;
    self.tracing = tracing;
    self.serviceName = serviceName;
    self.headers = headers;
    self.checksum = checksum;
    self.retryFlags = retryFlags;
    self.connection = connection;
    self.hostPort = hostPort;
    self.tracer = tracer;
}

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

    var res;
    if (opts.streamed) {
        res = new StreamingInResponse(resFrame.id, opts);
    } else {
        res = new InResponse(resFrame.id, opts);
    }

    res.errorEvent.on(onResError);

    function onResError(err) {
        self.onResError(err, res);
    }

    return res;
};
