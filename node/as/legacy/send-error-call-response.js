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
