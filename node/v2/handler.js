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

var v2 = require('./index');

module.exports = TChannelV2Handler;

var TChannelUnhandledFrameTypeError = TypedError({
    type: 'tchannel.unhandled-frame-type',
    message: 'unhandled frame type {typeCode}',
    typeCode: null
});

var TChannelApplicationError = TypedError({
    type: 'tchannel.application',
    message: 'tchannel application error code {code}',
    code: null,
    arg1: null,
    arg2: null,
    arg3: null
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
    var id = reqFrame.id;
    var name = String(reqFrame.body.arg1);

    if (self.remoteHostPort === null) {
        return callback(new Error('call request before init request')); // TODO typed error
    }

    var handler = self.channel.getEndpointHandler(name);
    var responseHeaders = {};

    self.runInOp(handler, {
        id: id,
        tracing: reqFrame.tracing,
        service: reqFrame.service,
        requestHeaders: reqFrame.headers,
        arg1: reqFrame.body.arg1,
        arg2: reqFrame.body.arg2,
        arg3: reqFrame.body.arg3,
        responseHeaders: responseHeaders
    }, function sendResponseFrame(err, res1, res2) {
        self.sendResponseFrame(reqFrame, responseHeaders, err, res1, res2);
    });
    callback();
};

TChannelV2Handler.prototype.handleCallResponse = function handleCallResponse(resFrame, callback) {
    var self = this;
    if (self.remoteHostPort === null) {
        return callback(new Error('call response before init response')); // TODO typed error
    }
    var id = resFrame.id;
    var code = resFrame.body.code;
    var arg1 = resFrame.body.arg1;
    var arg2 = resFrame.body.arg2;
    var arg3 = resFrame.body.arg3;
    if (code === v2.CallResponse.Codes.OK) {
        self.completeOutOp(null, id, arg2, arg3);
    } else {
        self.completeOutOp(TChannelApplicationError({
            code: code,
            arg1: arg1,
            arg2: arg2,
            arg3: arg3
        }), id, arg2, null);
    }
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
        self.completeOutOp(err, id, null, null);
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

TChannelV2Handler.prototype.sendResponseFrame = function sendResponseFrame(reqFrame, headers, err, res1, res2) {
    // TODO: refactor this all the way back out through the op handler calling convention
    var self = this;
    var id = reqFrame.id;
    var flags = 0; // TODO: streaming
    var arg1 = reqFrame.body.arg1;
    var tracing = reqFrame.body.tracing;
    var checksumType = reqFrame.body.csum.type;
    var resBody;
    if (err) {
        var errArg = isError(err) ? err.message : JSON.stringify(err); // TODO: better
        resBody = v2.CallResponse(flags, v2.CallResponse.Codes.Error, tracing, headers, checksumType, arg1, res1, errArg);
    } else {
        resBody = v2.CallResponse(flags, v2.CallResponse.Codes.OK, tracing, headers, checksumType, arg1, res1, res2);
    }
    var resFrame = v2.Frame(id, resBody);
    self.push(resFrame);
};
/* jshint maxparams:4 */

function isError(obj) {
    return typeof obj === 'object' && (
        Object.prototype.toString.call(obj) === '[object Error]' ||
        obj instanceof Error);
}
