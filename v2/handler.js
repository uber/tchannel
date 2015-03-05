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

var TypedError = require('error/typed');
var Duplex = require('stream').Duplex;
var util = require('util');

var TChannelOutgoingResponse = require('../reqres').OutgoingResponse;
var TChannelIncomingRequest = require('../reqres').IncomingRequest;
var TChannelIncomingResponse = require('../reqres').IncomingResponse;
var v2 = require('./index');

module.exports = TChannelV2Handler;

var TChannelUnhandledFrameTypeError = TypedError({
    type: 'tchannel.unhandled-frame-type',
    message: 'unhandled frame type {typeCode}',
    typeCode: null
});

function TChannelV2Handler(channel, options) {
    if (!(this instanceof TChannelV2Handler)) {
        return new TChannelV2Handler(channel, options);
    }
    var self = this;
    Duplex.call(self, {
        objectMode: true
    });
    self.channel = channel;
    // TODO: may be better suited to pull out an operation collection
    // abstraction and then encapsulate through that rather than this
    // run/complete approach
    self.runInOp = options.runInOp;
    self.completeOutOp = options.completeOutOp;
    self.remoteHostPort = null; // filled in by identify message
    self.lastSentFrameId = 0;
}

util.inherits(TChannelV2Handler, Duplex);

TChannelV2Handler.prototype.nextFrameId = function nextFrameId() {
    var self = this;
    self.lastSentFrameId = (self.lastSentFrameId + 1) % v2.Frame.MaxId;
    return self.lastSentFrameId;
};

TChannelV2Handler.prototype._write = function _write(frame, encoding, callback) {
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
        case v2.Types.Error:
            return self.handleError(frame, callback);
        default:
            return callback(TChannelUnhandledFrameTypeError({
                typeCode: frame.body.type
            }));
    }
};

TChannelV2Handler.prototype._read = function _read(/* n */) {
    /* noop */
};

TChannelV2Handler.prototype.handleInitRequest = function handleInitRequest(reqFrame, callback) {
    var self = this;
    if (self.remoteHostPort !== null) {
        return callback(new Error('duplicate init request')); // TODO typed error
    }
    /* jshint camelcase:false */
    var headers = reqFrame.body.headers;
    var init = {
        hostPort: headers.host_port,
        processName: headers.process_name
    };
    /* jshint camelcase:true */
    self.remoteHostPort = init.hostPort;
    self.emit('init.request', init);
    self.sendInitResponse(reqFrame);
    callback();
};

TChannelV2Handler.prototype.handleInitResponse = function handleInitResponse(resFrame, callback) {
    var self = this;
    if (self.remoteHostPort !== null) {
        return callback(new Error('duplicate init response')); // TODO typed error
    }
    /* jshint camelcase:false */
    var headers = resFrame.body.headers;
    var init = {
        hostPort: headers.host_port,
        processName: headers.process_name
    };
    /* jshint camelcase:true */
    self.remoteHostPort = init.hostPort;
    self.emit('init.response', init);
    callback();
};

TChannelV2Handler.prototype.handleCallRequest = function handleCallRequest(reqFrame, callback) {
    var self = this;
    if (self.remoteHostPort === null) {
        return callback(new Error('call request before init request')); // TODO typed error
    }
    var req = self.buildIncomingRequest(reqFrame);
    var res = self.buildOutgoingResponse(req);
    var handler = self.channel.getEndpointHandler(req.name);
    self.runInOp(handler, req, res.send.bind(res));
    callback();
};

TChannelV2Handler.prototype.handleCallResponse = function handleCallResponse(resFrame, callback) {
    var self = this;
    if (self.remoteHostPort === null) {
        return callback(new Error('call response before init response')); // TODO typed error
    }
    var res = self.buildIncomingResponse(resFrame);
    self.emit('call.incoming.response', res);
    callback();
};

TChannelV2Handler.prototype.handleError = function handleError(errFrame, callback) {
    var self = this;
    var id = errFrame.id;
    var code = errFrame.body.code;
    var message = errFrame.body.message;
    var err = v2.ErrorResponse.CodeErrors[code]({
        originalId: id,
        message: message
    });
    if (id === v2.Frame.NullId) {
        // fatal error not associated with a prior frame
        callback(err);
    } else {
        self.emit('call.incoming.error', err);
        callback();
    }
};

TChannelV2Handler.prototype.sendInitRequest = function sendInitRequest() {
    var self = this;
    var id = self.nextFrameId(); // TODO: assert(id === 1)?
    var hostPort = self.channel.hostPort;
    var processName = self.channel.processName;
    var body = v2.InitRequest(v2.VERSION, {
        /* jshint camelcase:false */
        host_port: hostPort,
        process_name: processName
        /* jshint camelcase:true */
    });
    var reqFrame = v2.Frame(id, body);
    self.push(reqFrame);
};

TChannelV2Handler.prototype.sendInitResponse = function sendInitResponse(reqFrame) {
    var self = this;
    var id = reqFrame.id;
    var hostPort = self.channel.hostPort;
    var processName = self.channel.processName;
    var body = v2.InitResponse(v2.VERSION, {
        /* jshint camelcase:false */
        host_port: hostPort,
        process_name: processName
        /* jshint camelcase:true */
    });
    var resFrame = v2.Frame(id, body);
    self.push(resFrame);
};

/* jshint maxparams:6 */
TChannelV2Handler.prototype.sendRequestFrame = function sendRequestFrame(options, arg1, arg2, arg3) {
    var self = this;
    var id = self.nextFrameId();
    var flags = 0; // TODO: streaming
    var ttl = options.timeout || 1; // TODO: better default, support for dynamic
    var tracing = options.tracing || null; // TODO: generate
    var service = options.service || null; // TODO: provide some sort of channel default
    var headers = options.headers || {};
    var csum;
    if (options.checksum === undefined || options.checksum === null) {
        csum = v2.Checksum.Types.FarmHash32;
    } else {
        csum = options.checksum;
    }
    var reqBody = v2.CallRequest(flags, ttl, tracing, service, headers, csum, arg1, arg2, arg3);
    var reqFrame = v2.Frame(id, reqBody);
    self.push(reqFrame);
    return id;
};

TChannelV2Handler.prototype.sendResponseFrame = function sendResponseFrame(res, err, res1, res2) {
    // TODO: refactor this all the way back out through the op handler calling convention
    var self = this;
    var resBody;
    var flags = 0; // TODO: streaming
    if (err) {
        var errArg = isError(err) ? err.message : JSON.stringify(err); // TODO: better
        resBody = v2.CallResponse(
            flags, v2.CallResponse.Codes.Error, res.tracing,
            res.headers, res.checksumType, res.name, res1, errArg);
    } else {
        resBody = v2.CallResponse(
            flags, v2.CallResponse.Codes.OK, res.tracing,
            res.headers, res.checksumType, res.name, res1, res2);
    }
    var resFrame = v2.Frame(res.id, resBody);
    self.push(resFrame);
};
/* jshint maxparams:4 */

TChannelV2Handler.prototype.buildOutgoingResponse = function buildOutgoingResponse(req) {
    var self = this;
    var res = TChannelOutgoingResponse(req.id, {
        tracing: req.tracing,
        headers: {},
        checksumType: req.checksumType,
        name: req.name,
    }, sendResponseFrame);
    return res;
    function sendResponseFrame(err, res1, res2) {
        self.sendResponseFrame(res, err, res1, res2);
    }
};

TChannelV2Handler.prototype.buildIncomingRequest = function buildIncomingRequest(reqFrame) {
    var name = String(reqFrame.body.arg1);
    var req = TChannelIncomingRequest(reqFrame.id, {
        id: reqFrame.id,
        ttl: reqFrame.ttl,
        tracing: reqFrame.tracing,
        service: reqFrame.service,
        name: name,
        headers: reqFrame.headers,
        checksumType: reqFrame.body.csum.type,
        arg2: reqFrame.body.arg2,
        arg3: reqFrame.body.arg3
    });
    return req;
};

TChannelV2Handler.prototype.buildIncomingResponse = function buildIncomingResponse(resFrame) {
    var res = TChannelIncomingResponse(resFrame.id, {
        code: resFrame.body.code,
        arg1: resFrame.body.arg1,
        arg2: resFrame.body.arg2,
        arg3: resFrame.body.arg3
    });
    return res;
};

function isError(obj) {
    return typeof obj === 'object' && (
        Object.prototype.toString.call(obj) === '[object Error]' ||
        obj instanceof Error);
}
