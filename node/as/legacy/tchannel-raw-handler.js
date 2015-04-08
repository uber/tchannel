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
