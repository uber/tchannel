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
var WrappedError = require('error/wrapped');

var safeErrorStringify = require('./safe-error-stringify.js');

var ErrorStringifyError = WrappedError({
    type: 'tchannel-raw-handler.stringify-error.error-failed',
    message: 'Coult not stringify err argument.\n' +
        'Expected JSON serialziable err for endpoint {endpoint}.\n' +
        'Failure: {causeMessage}.',
    statusCode: 500,
    endpoint: null
});

module.exports = sendErrorCallResponse;

function sendErrorCallResponse(resp, err, opts) {
    var endpoint = opts.endpoint;
    var logger = opts.logger;

    assert(logger, 'logger is required');

    safeErrorStringify(err, onString);

    function onString(stringifyErr, errStr) {
        // success case.
        if (errStr) {
            return resp.sendNotOk(null, errStr);
        }

        // failure case
        var cleanErr = ErrorStringifyError(stringifyErr, {
            endpoint: endpoint,
            value: stringifyErr
        });
        logger.error('sendErrorCallResponse could not stringify error', {
            cleanErr: cleanErr,
            originalErr: err
        });

        resp.sendNotOk(null, JSON.stringify({
            message: cleanErr.message,
            type: cleanErr.type,
            statusCode: cleanErr.statusCode,
            endpoint: cleanErr.endpoint
        }));
    }
}
