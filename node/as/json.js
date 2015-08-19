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
var Result = require('bufrw/result');
var cyclicStringify = require('json-stringify-safe');

var errors = require('../errors.js');

module.exports = TChannelJSON;

function TChannelJSON(options) {
    if (!(this instanceof TChannelJSON)) {
        return new TChannelJSON(options);
    }

    var self = this;

    // lazily populated from tchannel
    self.logger = null;

    var bossMode = options && options.bossMode;
    self.bossMode = typeof bossMode === 'boolean' ? bossMode : false;

    var logParseFailures = options && options.logParseFailures;
    self.logParseFailures = typeof logParseFailures === 'boolean' ?
        logParseFailures : true;

    // only used in request()
    self.channel = options && options.channel;
}

function TChannelJSONRequest(options) {
    var self = this;

    self.channel = options.channel;
    self.reqOptions = options.reqOptions;
    self.tchannelJSON = options.tchannelJSON;
}

TChannelJSONRequest.prototype.send =
function send(endpoint, head, body, callback) {
    var self = this;

    var outreq = self.channel.request(self.reqOptions);
    self.tchannelJSON.send(outreq, endpoint, head, body, callback);
};

TChannelJSON.prototype.request = function request(reqOptions) {
    var self = this;

    assert(self.channel, 'channel is required for json.request()');

    var req = new TChannelJSONRequest({
        channel: self.channel,
        reqOptions: reqOptions,
        tchannelJSON: self
    });

    return req;
};

/*eslint max-params: [2, 5]*/
TChannelJSON.prototype.send = function send(
    req, endpoint, head, body, callback
) {

    var self = this;

    if (!self.logger) {
        self.logger = req.logger;
    }

    assert(typeof endpoint === 'string', 'endpoint must be a string');
    assert(typeof req.serviceName === 'string' && req.serviceName !== '',
        'req.serviceName must be a string');
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
        var response = new TChannelJSONResponse(resp, v);

        callback(null, response);
    }
};

function TChannelJSONResponse(response, parseResult) {
    var self = this;

    self.ok = response.ok;
    self.head = parseResult.head;
    self.body = null;

    if (response.ok) {
        self.body = parseResult.body;
    } else {
        self.body = errors.ReconstructedError(parseResult.body);
    }

    self.headers = response.headers;
}

TChannelJSON.prototype.register = function register(
    tchannel, arg1, opts, handlerFunc
) {
    var self = this;

    if (!self.logger) {
        self.logger = tchannel.logger;
    }

    assert(typeof arg1 === 'string', 'endpoint has to be a string');

    tchannel.register(arg1, endpointHandler);

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
                    error: err
                });
                return res.sendError('UnexpectedError', 'Unexpected Error');
            }

            if (!self.bossMode) {
                assert(typeof respObject.ok === 'boolean',
                    'expected respObject to have an `ok` boolean');
                assert(respObject.body !== undefined,
                    'expected respObject to have a body');
                // Assert that body is an error
                if (!respObject.ok) {
                    assert(isTypedError(respObject.body),
                        'not-ok body should be a typed error');
                }
            } else if (typeof respObject.ok !== 'boolean' ||
                       respObject.body === undefined ||
                       !(respObject.ok || isTypedError(respObject.body))) {
                respObject.body = errors.InvalidJSONBody({
                    head: respObject.head,
                    body: respObject.body
                });
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

            if (res.setOk(respObject.ok)) {
                res.headers.as = 'json';
                res.send(
                    stringifyResult.value.head,
                    stringifyResult.value.body
                );
            }
        }
    }
};

TChannelJSON.prototype._stringify = function stringify(opts) {
    var self = this;

    var headR = safeJSONStringify(opts.head);
    if (headR.err) {
        var headStringifyErr = errors.JSONHeadStringifyError(headR.err, {
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
        var bodyStringifyErr = errors.JSONBodyStringifyError(bodyR.err, {
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
        var headParseErr = errors.JSONHeadParserError(headR.err, {
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
        var bodyParseErr = errors.JSONBodyParserError(bodyR.err, {
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

function isTypedError(obj) {
    return isError(obj) &&
           typeof obj.type === 'string';
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

function isError(err) {
    return Object.prototype.toString.call(err) === '[object Error]';
}
