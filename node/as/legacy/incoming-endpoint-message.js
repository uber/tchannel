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

var safeJSONParse = require('safe-json-parse/callback');
var WrappedError = require('error/wrapped');
var assert = require('assert');

var HeadParserError = WrappedError({
    type: 'tchannel-handler.parse-error.head-failed',
    message: 'Could not parse head (arg2) argument.\n' +
        'Expected JSON encoded arg2 for endpoint {endpoint}.\n' +
        'Got {headStr} instead of JSON.',
    endpoint: null,
    arg2: null,
    headStr: null
});

var BodyParserError = WrappedError({
    type: 'tchannel-handler.parse-error.body-failed',
    message: 'Could not parse body (arg3) argument.\n' +
        'Expected JSON encoded arg3 for endpoint {endpoint}.\n' +
        'Got {bodyStr} instead of JSON.',
    endpoint: null,
    arg3: null,
    bodyStr: null
});

function IncomingEndpointRequestMessage(req) {
    assert(req.arg1 !== undefined, 'req.arg1 required');
    assert(req.arg2 !== undefined, 'req.arg2 required');
    assert(req.arg3 !== undefined, 'req.arg3 required');
    assert(req.service !== undefined, 'req.service required');
    assert(req.remoteAddr !== undefined, 'req.remoteAddr required');

    this.service = req.service;
    this.endpoint = String(req.arg1);
    this.head = req.arg2;
    this.body = req.arg3;
    this.hostInfo = req.remoteAddr;
}
function IncomingEndpointResponseMessage(resp) {
    assert(resp.arg1 !== undefined, 'resp.arg1 required');
    assert(resp.arg2 !== undefined, 'resp.arg2 required');
    assert(resp.arg3 !== undefined, 'resp.arg3 required');
    assert(resp.ok !== undefined, 'resp.ok required');

    this.endpoint = String(resp.arg1);
    this.head = resp.arg2;
    this.body = resp.arg3;
    this.ok = resp.ok;
}

IncomingEndpointMessage.jsonParse = jsonParse;

module.exports = IncomingEndpointMessage;

function IncomingEndpointMessage(incoming) {
    assert(incoming, 'incoming required');

    if (typeof incoming.service === 'string') {
        return new IncomingEndpointRequestMessage(incoming);
    } else if (typeof incoming.ok === 'boolean') {
        return new IncomingEndpointResponseMessage(incoming);
    } else {
        // TODO typed error
        throw new Error('Invalid incoming endpoint message');
    }
}

function jsonParse(inc, opts, cb) {
    var logger = opts.logger;

    assert(logger, 'json parse incoming inc needs logger');

    var headStr = String(inc.arg2);
    var bodyStr = String(inc.arg3);

    jsonParseArg(headStr, onArg2);

    function onArg2(err, head) {
        if (err) {
            var headParseErr = HeadParserError(err, {
                endpoint: opts.endpoint,
                arg2: headStr,
                headStr: headStr.slice(0, 10)
            });

            logger.warn('Got unexpected invalid JSON for arg2', {
                endpoint: opts.endpoint,
                headErr: headParseErr
            });
            return cb(headParseErr);
        }

        jsonParseArg(bodyStr, onArg3);

        function onArg3(err2, body) {
            if (err2) {
                var bodyParseErr = BodyParserError(err2, {
                    endpoint: opts.endpoint,
                    arg3: bodyStr,
                    bodyStr: bodyStr.slice(0, 10)
                });

                logger.warn('Got unexpected invalid JSON for arg3', {
                    endpoint: opts.endpoint,
                    bodyErr: bodyParseErr
                });
                return cb(bodyParseErr);
            }

            var incoming = IncomingEndpointMessage({
                service: inc.service,
                arg1: String(inc.arg1),
                arg2: head,
                arg3: body,
                remoteAddr: inc.remoteAddr,
                ok: inc.ok
            });

            cb(null, incoming);
        }
    }
}

function jsonParseArg(argX, cb) {
    if (argX === '') {
        cb(null, null);
    } else {
        safeJSONParse(argX, cb);
    }
}
