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

module.exports = tchannelRawHandler;

function tchannelRawHandler(handler, endpoint, options) {
    endpointHandler.options = options;

    var logger = options.clients.logger;
    assert(logger, 'raw handler needs a logger');

    // TODO decode tchannel errors
    return endpointHandler;

    function endpointHandler(req, buildRes) {
        var incoming = IncomingEndpointMessage(req);
        var res = buildRes();

        handler.call(res, incoming, options, onResponse);

        function onResponse(err, outgoing) {
            if (err) {
                return sendErrorCallResponse(res, err, {
                    endpoint: endpoint,
                    logger: logger
                });
            }

            outgoing = OutgoingEndpointMessage(outgoing);
            outgoing.writeTo(res);
        }
    }
}
