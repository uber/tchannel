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


var v1 = require('./index');
module.exports = TChannelHandler;

function TChannelHandler(conn, writeFrame) {
    var self = this;
    self.conn = conn;
    self.writeFrame = writeFrame;
}

TChannelHandler.prototype.buildRequestFrame = function buildRequestFrame(options) {
    var reqFrame = new v1.Frame();
    reqFrame.header.id = options.id;
    reqFrame.header.seq = 0;
    reqFrame.set(options.arg1, options.arg2, options.arg3);
    reqFrame.header.type = v1.Types.reqCompleteMessage;
    return reqFrame;
};

TChannelHandler.prototype.handleFrame = function handleFrame(frame) {
    var self = this;
    switch (frame.header.type) {
        case v1.Types.reqCompleteMessage:
            return self.handleCallRequest(frame);
        case v1.Types.resCompleteMessage:
            return self.handleCallResponse(frame);
        case v1.Types.resError:
            return self.handleError(frame);
        default:
            self.logger.error('unhandled frame type', {
                type: frame.header.type
            });
    }
};

TChannelHandler.prototype.handleInitRequest = function handleInitRequest(reqFrame) {
    var self = this;
    if (self.conn.remoteName !== null) {
        self.conn.resetAll(new Error('duplicate init request')); // TODO typed error
        return;
    }
    var hostPort = reqFrame.arg2.toString();
    self.conn.remoteName = hostPort;
    self.conn.channel.addPeer(hostPort, self.conn);
    self.conn.channel.emit('identified', hostPort);
    self.sendInitResponse(reqFrame);
};

TChannelHandler.prototype.handleInitResponse = function handleInitResponse(resFrame) {
    var self = this;
    if (self.conn.remoteName !== null) {
        self.conn.resetAll(new Error('duplicate init response')); // TODO typed error
        return;
    }
    var remote = String(resFrame.arg2);
    self.conn.remoteName = remote;
    self.conn.channel.emit('identified', remote);
};

TChannelHandler.prototype.handleCallRequest = function handleCallRequest(reqFrame) {
    var self = this;
    var id = reqFrame.header.id;
    var name = reqFrame.arg1.toString();

    if (name === 'TChannel identify') {
        self.handleInitRequest(reqFrame);
        return;
    }

    if (self.conn.remoteName === null) {
        self.conn.resetAll(new Error('call request before init request')); // TODO typed error
        return;
    }

    var handler = self.conn.channel.getEndpointHandler(name);
    self.conn.runInOp(handler, {
        id: id,
        arg1: reqFrame.arg1,
        arg2: reqFrame.arg2,
        arg3: reqFrame.arg3,
    }, function buildResponseFrame(err, res1, res2) {
        var resFrame = new v1.Frame();
        resFrame.header.id = id;
        resFrame.header.seq = 0;
        if (err) {
            // TODO should the error response contain a head ?
            // Is there any value in sending meta data along with
            // the error.
            resFrame.set(isError(err) ? err.message : err, null, null);
            resFrame.header.type = v1.Types.resError;
        } else {
            resFrame.set(name, res1, res2);
            resFrame.header.type = v1.Types.resCompleteMessage;
        }
        return resFrame;
    });
};

TChannelHandler.prototype.handleCallResponse = function handleCallResponse(resFrame) {
    var self = this;

    if (String(resFrame.arg1) === 'TChannel identify') {
        self.handleInitResponse(resFrame);
        return;
    }

    if (self.conn.remoteName === null) {
        self.conn.resetAll(new Error('call response before init response')); // TODO typed error
        return;
    }

    var id = resFrame.header.id;
    var arg2 = resFrame.arg2;
    var arg3 = resFrame.arg3;
    self.conn.completeOutOp(id, null, arg2, arg3);
};

TChannelHandler.prototype.handleError = function handleError(errFrame) {
    var self = this;
    var id = errFrame.header.id;
    var message = errFrame.arg1;
    var err = new Error(message);
    self.conn.completeOutOp(id, err, null, null);
};

TChannelHandler.prototype.sendInitRequest = function sendInitRequest() {
    var self = this;
    var reqFrame = new v1.Frame();
    var id = self.conn.nextFrameId();
    reqFrame.header.id = id;
    reqFrame.header.seq = 0;
    reqFrame.set('TChannel identify', self.conn.channel.hostPort, null);
    reqFrame.header.type = v1.Types.reqCompleteMessage;
    self.writeFrame(reqFrame);
};

TChannelHandler.prototype.sendInitResponse = function sendInitResponse(reqFrame) {
    var self = this;
    var id = reqFrame.header.id;
    var arg1 = reqFrame.arg1;
    var resFrame = new v1.Frame();
    resFrame.header.id = id;
    resFrame.header.seq = 0;
    resFrame.set(arg1, self.conn.channel.hostPort, null);
    resFrame.header.type = v1.Types.resCompleteMessage;
    self.writeFrame(resFrame);
};

function isError(obj) {
    return typeof obj === 'object' && (
        Object.prototype.toString.call(obj) === '[object Error]' ||
        obj instanceof Error);
}
