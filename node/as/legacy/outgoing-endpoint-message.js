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

var stringify = require('json-stringify-safe');
var assert = require('assert');
var WrappedError = require('error/wrapped');

var safeJSONStringify = require('./safe-json-stringify.js');

var HeadStringifyError = WrappedError({
    type: 'tchannel-handler.stringify-error.head-failed',
    message: 'Could not stringify head (res1) argument.\n' +
        'Expected JSON serializable res1 for endpoint {endpoint}.',
    endpoint: null,
    head: null,
    direction: null
});

var BodyStringifyError = WrappedError({
    type: 'tchannel-handler.stringify-error.body-failed',
    message: 'Could not stringify body (res2) argument.\n' +
        'Expected JSON serializable res2 for endpoint {endpoint}.',
    endpoint: null,
    body: null,
    direction: null
});

OutgoingEndpointMessage.jsonStringify = jsonStringify;

module.exports = OutgoingEndpointMessage;

function OutgoingEndpointMessage(outgoing) {
    if (!(this instanceof OutgoingEndpointMessage)) {
        return new OutgoingEndpointMessage(outgoing);
    }

    assert(outgoing, 'outgoing required');
    assert(outgoing.head !== undefined, 'outgoing.head required');
    assert(outgoing.body !== undefined, 'outgoing.body required');

    this.head = outgoing.head || '';
    this.body = outgoing.body || '';
}

OutgoingEndpointMessage.prototype.writeTo = function writeTo(resp) {
    resp.sendOk(this.head, this.body);
};

OutgoingEndpointMessage.prototype.sendTo = function sendTo(opts, cb) {
    assert(opts.endpoint, 'endpoint required');
    assert(opts.hostPort, 'hostPort required');
    assert(opts.service, 'service required');
    assert(opts.tchannel, 'tchannel required');
    assert(typeof opts.timeout === 'number', 'timeout required');

    opts.tchannel.request({
        host: opts.hostPort,
        service: opts.service,
        timeout: opts.timeout
    }).send(opts.endpoint, this.head, this.body, cb);
};

function jsonStringify(outgoing, opts, cb) {
    var logger = opts.logger;

    assert(logger, 'json parse incoming req needs logger');
    assert(outgoing, 'outgoing required');
    assert(outgoing.head !== undefined, 'outgoing.head required');
    assert(outgoing.body !== undefined, 'outgoing.body required');

    safeJSONStringify(outgoing.head, onRes1);

    function onRes1(err2, res1) {
        if (err2) {
            var headStringifyErr = HeadStringifyError(err2, {
                endpoint: opts.endpoint,
                direction: opts.direction,
                head: outgoing.head
            });

            logger.error('Got unexpected unserializable JSON for res1', {
                endpoint: opts.endpoint,
                direction: opts.direction,
                headErr: headStringifyErr
            });
            return cb(headStringifyErr);
        }

        safeJSONStringify(outgoing.body, onRes2);

        function onRes2(err3, res2) {
            if (err3) {
                var bodyStringifyErr = BodyStringifyError(err3, {
                    endpoint: opts.endpoint,
                    direction: opts.direction,
                    body: stringify(outgoing.body)
                });

                logger.error('Got unexpected unserializable JSON for res2', {
                    endpoint: opts.endpoint,
                    direction: opts.direction,
                    bodyErr: bodyStringifyErr
                });
                return cb(bodyStringifyErr);
            }

            var outgoingResult = new OutgoingEndpointMessage({
                head: res1,
                body: res2
            });

            cb(null, outgoingResult);
        }
    }
}
