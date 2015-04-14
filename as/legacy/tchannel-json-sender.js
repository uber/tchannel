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

var OutgoingEndpointMessage = require('./outgoing-endpoint-message.js');
var IncomingEndpointMessage = require('./incoming-endpoint-message.js');
var reconstructError = require('./reconstructed-error');

var DIRECTION = 'out-of-process';

module.exports = tchannelSender;

function tchannelSender(options) {
    var logger = options.logger;
    var tchannel = options.tchannel;

    assert(tchannel, 'json sender needs a tchannel');
    assert(logger, 'json sender needs a logger');

    return {
        send: send
    };

    function send(opts, cb) {
        opts.tchannel = tchannel;
        assert(cb, 'json sender callback function is required');

        OutgoingEndpointMessage.jsonStringify(opts, {
            endpoint: opts.endpoint,
            direction: DIRECTION,
            logger: logger
        }, onBuffers);

        function onBuffers(err, outgoingBuffers) {
            // if we failed to stringify shit
            if (err) {
                return cb(err);
            }

            outgoingBuffers.sendTo(opts, onResponse);
        }

        function onResponse(err, resp, arg2, arg3) {
            if (err) {
                // TODO parse error frames
                return cb(err);
            }

            resp.arg2 = arg2;
            resp.arg3 = arg3;

            if (resp.ok) {
                return IncomingEndpointMessage.jsonParse(resp, {
                    endpoint: opts.endpoint,
                    direction: DIRECTION,
                    logger: logger
                }, cb);
            }

            reconstructError(arg3, {
                logger: logger,
                endpoint: opts.endpoint
            }, cb);
        }
    }
}
