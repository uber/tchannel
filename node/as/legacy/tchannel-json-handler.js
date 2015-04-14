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
var sendErrorCallResponse = require('./send-error-call-response.js');

var DIRECTION = 'into-the-process';

module.exports = tchannelHandler;

// TODO How should we serialize errors,
// TODO what does tchannel do?
function tchannelHandler(handler, endpoint, options) {
    endpointHandler.options = options;

    var logger = options.clients.logger;
    assert(logger, 'json handler needs a logger');

    /*eslint max-statements: [2, 20] */
    return endpointHandler;

    function endpointHandler(req, res, arg2, arg3) {
        IncomingEndpointMessage.jsonParse(req, {
            endpoint: endpoint,
            direction: DIRECTION,
            logger: logger
        }, onIncoming);

        function onIncoming(err, incoming) {
            if (err) {
                return sendErrorCallResponse(res, err, {
                    endpoint: endpoint,
                    logger: logger
                });
            }

            handler(incoming, options, onResponse);
        }

        function onResponse(err, outgoing) {
            if (err) {
                return sendErrorCallResponse(res, err, {
                    endpoint: endpoint,
                    logger: logger
                });
            }

            OutgoingEndpointMessage.jsonStringify(outgoing, {
                endpoint: endpoint,
                direction: DIRECTION,
                logger: logger
            }, onBuffers);

            function onBuffers(err2, outgoingBuffers) {
                if (err2) {
                    return sendErrorCallResponse(res, err2, {
                        endpoint: endpoint,
                        logger: logger
                    });
                }

                outgoingBuffers.writeTo(res);
            }
        }
    }
}
