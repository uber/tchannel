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
