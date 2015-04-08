'use strict';

var assert = require('assert');

var OutgoingEndpointMessage = require('./outgoing-endpoint-message.js');
var IncomingEndpointMessage = require('./incoming-endpoint-message.js');
var reconstructError = require('./reconstructed-error');

module.exports = tchannelRawSender;

function tchannelRawSender(options) {
    var logger = options.logger;
    var tchannel = options.tchannel;

    assert(tchannel, 'raw sender needs a tchannel');
    assert(logger, 'raw sender needs a logger');

    return {
        send: send
    };

    function send(opts, cb) {
        opts.tchannel = tchannel;
        assert(cb, 'raw sender callback function is required');

        var outgoing = OutgoingEndpointMessage(opts);

        outgoing.sendTo(opts, onResponse);

        function onResponse(err, resp, arg2, arg3) {
            if (err) {
                // The only thing that generates error frames
                // is Autobahn itself
                // TODO handle non-JSON frames from tchannel

                reconstructError(err.message, {
                    logger: logger,
                    endpoint: opts.endpoint
                }, onErrorFrameReconstructed);
                return;
            }

            resp.arg2 = resp.head = arg2;
            resp.arg3 = resp.body = arg3;
            if (resp.ok) {
                cb(null, IncomingEndpointMessage(resp));
                return;
            }

            reconstructError(resp.arg3, {
                logger: logger,
                endpoint: opts.endpoint
            }, cb);

            // TODO properly add fields from error back
            function onErrorFrameReconstructed(errObj) {
                // TODO better handling of parser error
                if (errObj.type === 'autobahn.reconstructed.malformed-type') {
                    // For now pass up original err
                    return cb(err);
                }

                errObj.isErrorFrame = true;
                errObj.errorCode = err.errorCode;
                errObj.originalId = err.originalId;
                return cb(errObj);
            }
        }
    }
}
