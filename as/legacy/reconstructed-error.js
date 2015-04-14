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
