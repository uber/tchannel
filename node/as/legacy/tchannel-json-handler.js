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
