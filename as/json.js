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

/* jshint maxparams:5 */

var Buffer = require('buffer').Buffer;
var assert = require('assert');
var NullLogtron = require('null-logtron');
var Result = require('bufrw/result');
var cyclicStringify = require('json-stringify-safe');
var WrappedError = require('error/wrapped');
var TypedError = require('error/typed');
var isError = require('is-error');

var HeadParserError = WrappedError({
    type: 'tchannel-handler.parse-error.head-failed',
    message: 'Could not parse head (arg2) argument.\n' +
        'Expected JSON encoded arg2 for endpoint {endpoint}.\n' +
        'Got {headStr} instead of JSON.',
    isSerializationError: true,
    endpoint: null,
    direction: null,
    headStr: null
});

var BodyParserError = WrappedError({
    type: 'tchannel-handler.parse-error.body-failed',
    message: 'Could not parse body (arg3) argument.\n' +
        'Expected JSON encoded arg3 for endpoint {endpoint}.\n' +
        'Got {bodyStr} instead of JSON.',
    isSerializationError: true,
    endpoint: null,
    direction: null,
    bodyStr: null
});

var HeadStringifyError = WrappedError({
    type: 'tchannel-handler.stringify-error.head-failed',
    message: 'Could not stringify head (res1) argument.\n' +
        'Expected JSON serializable res1 for endpoint {endpoint}.',
    isSerializationError: true,
    endpoint: null,
    head: null,
    direction: null
});

var BodyStringifyError = WrappedError({
    type: 'tchannel-handler.stringify-error.body-failed',
    message: 'Could not stringify body (res2) argument.\n' +
        'Expected JSON serializable res2 for endpoint {endpoint}.',
    isSerializationError: true,
    endpoint: null,
    body: null,
    direction: null
});

// # ReconstructedError
var ReconstructedError = TypedError({
    type: 'tchannel.hydrated-error.default-type',
    message: 'TChannel json hydrated error;' +
        ' this message should be replaced with an upstream error message'
});

module.exports = TChannelJSON;

function TChannelJSON(options) {
    if (!(this instanceof TChannelJSON)) {
        return new TChannelJSON(options);
    }

    var self = this;

    self.logger = options && options.logger || NullLogtron();

    var strictMode = options && options.strictMode;
    self.strictMode = typeof strictMode === 'boolean' ? strictMode : true;

    var logParseFailures = options && options.logParseFailures;
    self.logParseFailures = typeof logParseFailures === 'boolean' ?
        logParseFailures : true;
}

/*eslint max-params: [2, 5]*/
TChannelJSON.prototype.send = function send(
    req, endpoint, head, body, callback
) {

    var self = this;

    assert(typeof endpoint === 'string', 'endpoint must be a string');
    assert(typeof req.service === 'string' && req.service !== '',
        'req.service must be a string');
    assert(body !== undefined, 'must send a body');

    var stringifyResult = self._stringify({
        head: head,
        body: body,
        endpoint: endpoint,
        direction: 'out.request'
    });
    if (stringifyResult.err) {
        return callback(stringifyResult.err);
    }

    req.headers.as = 'json';

    req.send(
        new Buffer(endpoint),
        new Buffer(stringifyResult.value.head || ''),
        new Buffer(stringifyResult.value.body || ''),
        onResponse
    );

    function onResponse(err, resp, arg2, arg3) {
        if (err) {
            return callback(err);
        }

        var parseResult = self._parse({
            head: arg2.toString('utf8'),
            body: arg3.toString('utf8'),
            endpoint: endpoint,
            direction: 'in.response'
        });

        if (parseResult.err) {
            return callback(parseResult.err);
        }

        var v = parseResult.value;
        var response = null;

        if (resp.ok) {
            response = new TChannelJSONResponse(resp.ok, v.head, v.body);
        } else {
            response = new TChannelJSONResponse(
                resp.ok, v.head, ReconstructedError(v.body)
            );
        }
        callback(null, response);
    }
};

TChannelJSON.prototype.register = function register(
    tchannel, opts, arg1, handlerFunc
) {
    var self = this;

    tchannel.handler.register(arg1, endpointHandler);

    function endpointHandler(req, res, arg2, arg3) {
        if (req.headers.as !== 'json') {
            var message = 'Expected call request as header to be json';
            return res.sendError('BadRequest', message);
        }

        var parseResult = self._parse({
            head: arg2.toString('utf8'),
            body: arg3.toString('utf8'),
            endpoint: arg1,
            direction: 'in.request'
        });

        if (parseResult.err) {
            var message2 = parseResult.err.type + ': ' +
                parseResult.err.message;
            return res.sendError('BadRequest', message2);
        }

        var v = parseResult.value;
        handlerFunc(opts, req, v.head, v.body, onResponse);

        function onResponse(err, respObject) {
            if (err) {
                assert(isError(err), 'Error argument must be an error');

                self.logger.error('Got unexpected error in handler', {
                    endpoint: arg1,
                    err: err
                });
                return res.sendError('UnexpectedError', 'Unexpected Error');
            }

            assert(typeof respObject.ok === 'boolean',
                'expected respObject to have an `ok` boolean');
            assert(respObject.body !== undefined,
                'expected respObject to have a body');

            // Assert that body is an error
            if (!respObject.ok && self.strictMode === true) {
                if (
                    !isError(respObject.body) ||
                    typeof respObject.body.type !== 'string'
                ) {
                    throw new Error('expected body to be a typed error');
                }
            }

            var stringifyResult = self._stringify({
                head: respObject.head,
                body: respObject.body,
                endpoint: arg1,
                direction: 'out.response'
            });

            if (stringifyResult.err) {
                return res.sendError('UnexpectedError',
                    'Could not JSON stringify');
            }

            res.setOk(respObject.ok);
            res.send(
                stringifyResult.value.head,
                stringifyResult.value.body
            );
        }
    }
};

TChannelJSON.prototype._stringify = function stringify(opts) {
    var self = this;

    var headR = safeJSONStringify(opts.head);
    if (headR.err) {
        var headStringifyErr = HeadStringifyError(headR.err, {
            endpoint: opts.endpoint,
            direction: opts.direction,
            head: cyclicStringify(opts.head)
        });

        self.logger.error('Got unexpected unserializable JSON for arg2', {
            endpoint: opts.endpoint,
            direction: opts.direction,
            headErr: headStringifyErr
        });
        return new Result(headStringifyErr);
    }

    var bodyR = safeJSONStringify(opts.body);
    if (bodyR.err) {
        var bodyStringifyErr = BodyStringifyError(bodyR.err, {
            endpoint: opts.endpoint,
            direction: opts.direction,
            body: cyclicStringify(opts.body)
        });

        self.logger.error('Got unexpected unserializable JSON for arg3', {
            endpoint: opts.endpoint,
            direction: opts.direction,
            bodyErr: bodyStringifyErr
        });
        return new Result(bodyStringifyErr);
    }

    return new Result(null, {
        head: headR.value,
        body: bodyR.value
    });
};

TChannelJSON.prototype._parse = function parse(opts) {
    var self = this;

    var headR = safeJSONParse(opts.head);
    if (headR.err) {
        var headParseErr = HeadParserError(headR.err, {
            endpoint: opts.endpoint,
            direction: opts.direction,
            headStr: opts.head.slice(0, 10)
        });

        if (self.logParseFailures) {
            self.logger.warn('Got unexpected invalid JSON for arg2', {
                endpoint: opts.endpoint,
                direction: opts.direction,
                headErr: headParseErr
            });
        }

        return new Result(headParseErr);
    }

    var bodyR = safeJSONParse(opts.body);
    if (bodyR.err) {
        var bodyParseErr = BodyParserError(bodyR.err, {
            endpoint: opts.endpoint,
            direction: opts.direction,
            bodyStr: opts.body.slice(0, 10)
        });

        if (self.logParseFailures) {
            self.logger.warn('Got unexpected invalid JSON for arg3', {
                endpoint: opts.endpoint,
                direction: opts.direction,
                bodyErr: bodyParseErr
            });
        }

        return new Result(bodyParseErr);
    }

    return new Result(null, {
        head: headR.value,
        body: bodyR.value
    });
};

function TChannelJSONResponse(ok, head, body) {
    var self = this;

    self.ok = ok;
    self.head = head;
    self.body = body;
}

function safeJSONStringify(obj) {
    var str;

    // jscs:disable
    try {
        str = JSON.stringify(obj);
    } catch (e) {
        return new Result(e);
    }
    // jscs:enable

    return new Result(null, str);
}

function safeJSONParse(str) {
    if (str === '') {
        return new Result(null, null);
    }

    var json;

    // jscs:disable
    try {
        json = JSON.parse(str);
    } catch (e) {
        return new Result(e);
    }
    // jscs:enable

    return new Result(null, json);
}
