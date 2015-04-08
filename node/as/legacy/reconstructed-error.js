'use strict';

var TypedError = require('error/typed');
var safeParse = require('safe-json-parse/callback');
var assert = require('assert');

module.exports = reconstructError;

// # ReconstructedError
var ReconstructedError = TypedError({
    type: 'autobahn.reconstructed.default-type',
    message: 'Autobahn reconstructed error; this message should be replaced ' +
        'with an upstream error message'
});

// ## reconstructedError
// Reconstruct errors that have been serialized.
function reconstructError(errStr, opts, cb) {
    var logger = opts.logger;
    assert(logger, 'reconstructError logged required');

    errStr = String(errStr);
    safeParse(errStr, onErrorParsed);

    function onErrorParsed(parseError, errObj) {
        if (parseError) {
            // TODO figure out a better heuristic for
            // Building a better default malformed error
            var failedParsingError = ReconstructedError({
                message: errStr,
                type: 'autobahn.reconstructed.malformed-type',
                endpoint: opts.endpoint
            });
            logger.error('Could not parse reconstructed error', {
                parseError: failedParsingError,
                errStr: errStr,
                endpoint: opts.endpoint
            });

            return cb(failedParsingError);
        }

        return cb(ReconstructedError(errObj));
    }
}
