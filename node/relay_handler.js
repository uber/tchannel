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

function RelayHandler(channel, serviceName, clients) {
    var self = this;
    self.serviceName = serviceName;
    self.channel = channel;
    self.clients = clients;
}

RelayHandler.prototype.type = 'tchannel.relay-handler';

RelayHandler.prototype.handleRequest = function handleRequest(req, buildRes) {
    var self = this;
    // TODO: frame-at-a-time rather than re-streaming?

    var outres = null;
    var outreq = self.channel.request({
        streamed: req.streamed,
        ttl: req.ttl,
        service: req.service,
        headers: req.headers
    });
    outreq.on('response', onResponse);
    outreq.on('error', onError);
    if (outreq.streamed) {
        req.arg1.pipe(outreq.arg1);
        req.arg2.pipe(outreq.arg2);
        req.arg3.pipe(outreq.arg3);
    } else {
        outreq.send(req.arg1, req.arg2, req.arg3);
    }
    return outreq;

    function onResponse(res) {
        if (outres) {
            return;
        }
        outres = buildRes({
            streamed: res.streamed,
            code: res.code
        });
        if (outres.streamed) {
            outres.arg1.end();
            res.arg2.pipe(outres.arg2);
            res.arg3.pipe(outres.arg3);
        } else {
            outres.send(res.arg2, res.arg3);
        }
    }

    function onError(err) {
        if (outres) {
            return;
        }
        var logger = self.clients.logger;

        outres = buildRes();
        if (err.isErrorFrame) {
            outres.sendError(err.codeName, err.message);
            return;
        }

        var codeName = errors.classify(err);
        // TODO: would be great if tchannel could define these as network errors
        if (!codeName && (
            err.type === 'tchannel.socket' ||
            err.type === 'tchannel.socket-closed')) {
            codeName = 'UnexpectedError';
        }

        if (codeName) {
            outres.sendError(codeName, err.message);
        } else {
            outres.sendError('UnexpectedError', err.message);
            logger.error('unexpected error while forwarding', {
                error: err
                // TODO context
            });
        }

        // TODO: stat in some cases, e.g. declined / peer not available
    }
};

module.exports = RelayHandler;
