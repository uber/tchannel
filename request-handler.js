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

var assert = require('assert');

// This function allows EndpointHandler to accept either a callback or a
// RequestHandler object that implements handleRequest.

module.exports = coerceRequestHandler;

function coerceRequestHandler(handler, thisp, options) {
    if (typeof handler === 'function') {
        if (options.streamed) {
            return new StreamedRequestCallbackHandler(handler, thisp);
        } else {
            return new RequestCallbackHandler(handler, thisp);
        }
    } else {
        assert(typeof handler.handleRequest === 'function', 'handler must have handleRequest method');
        return handler;
    }
}

// The non-streamed request handler is only for the cases where neither the
// request or response can have streams. In this case, a req.stream indicates
// that the request is fragmented across multiple frames.
function RequestCallbackHandler(callback, thisp) {
    var self = this;
    self.callback = callback;
    self.thisp = thisp || self;
}

RequestCallbackHandler.prototype.handleRequest = function handleRequest(req, buildResponse) {
    var self = this;
    var res;
    if (req.streamed) {
        req.withArg23(function onArg23(err, arg2, arg3) {
            res = buildResponse({streamed: false});
            return self.callback.call(self.thisp, req, res, arg2, arg3);
        });
    } else {
        res = buildResponse({streamed: false});
        self.callback.call(self.thisp, req, res, req.arg2, req.arg3);
    }
};

// The streamed request handler is for cases where the handler function elects
// to deal with whether req.streamed and whether res.streamed.
// req.streamed may indicated either a streaming request or a fragmented
// request and the handler must distinguish the cases.
function StreamedRequestCallbackHandler(callback, thisp) {
    var self = this;
    self.callback = callback;
    self.thisp = thisp || self;
}

StreamedRequestCallbackHandler.prototype.handleRequest = function handleRequest(req, buildResponse) {
    var self = this;
    return self.callback.call(self.thisp, req, buildResponse);
};
