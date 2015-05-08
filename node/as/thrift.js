
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
var bufrw = require('bufrw');
var Result = require('bufrw/result');

var errors = require('../errors.js');

var HeaderRW = bufrw.Repeat(
    bufrw.UInt16BE,
    bufrw.Series(bufrw.str2, bufrw.str2)
);

module.exports = TChannelAsThrift;

function TChannelAsThrift(opts) {
    if (!this instanceof TChannelAsThrift) {
        return new TChannelAsThrift(opts);
    }

    var self = this;

    assert(opts && opts.spec, 'TChannelAsThrift expected spec');
    self.spec = opts.spec;

    self.logger = null;

    var bossMode = opts && opts.bossMode;
    self.bossMode = typeof bossMode === 'boolean' ? bossMode : false;

    var logParseFailures = opts && opts.logParseFailures;
    self.logParseFailures = typeof logParseFailures === 'boolean' ?
        logParseFailures : true;
}

TChannelAsThrift.prototype.register =
function register(channel, name, opts, handle) {
    var self = this;

    if (!self.logger) {
        self.logger = channel.logger;
    }

    channel.register(name, handleThriftRequest);

    function handleThriftRequest(req, res, inHeadBuffer, inBodyBuffer) {
        if (req.headers.as !== 'thrift') {
            var message = 'Expected call request as header to be thrift';
            return res.sendError('BadRequest', message);
        }

        // Process incoming thrift body
        var parseResult = self._parse({
            head: inHeadBuffer,
            body: inBodyBuffer,
            endpoint: name,
            direction: 'in.request'
        });

        if (parseResult.err) {
            var message2 = parseResult.err.type + ': ' +
                parseResult.err.message;
            return res.sendError('BadRequest', message2);
        }

        var v = parseResult.value;
        handle(opts, req, v.head, v.body, handleThriftResponse);

        function handleThriftResponse(err, thriftRes) {
            if (err) {
                assert(isError(err), 'Error argument must be an error');

                self.logger.error('Got unexpected error in handler', {
                    endpoint: name,
                    err: err
                });

                return res.sendError('UnexpectedError', 'Unexpected Error');
            }

            if (!self.bossMode) {
                assert(typeof thriftRes.ok === 'boolean',
                    'expected response.ok to be a boolean');
                assert(thriftRes.body !== undefined,
                    'expected response.body to exist');

                if (!thriftRes.ok) {
                    assert(isError(thriftRes.body),
                        'not-ok body should be an error');
                    assert(thriftRes.body.nameAsThrift,
                        'expected not-ok body to have nameAsThrift field');
                }
            }

            var stringifyResult = self._stringify({
                head: thriftRes.head,
                body: thriftRes.body,
                ok: thriftRes.ok,
                endpoint: name,
                direction: 'out.response'
            });

            if (stringifyResult.err) {
                return res.sendError('UnexpectedError',
                    'Could not serialize thrift');
            }

            res.setOk(thriftRes.ok);
            res.send(
                stringifyResult.value.head,
                stringifyResult.value.body
            );
        }
    }
};

/* jshint maxparams:5 */
TChannelAsThrift.prototype.send =
function send(request, endpoint, outHead, outBody, callback) {
    var self = this;

    assert(typeof endpoint === 'string', 'send requires endpoint');
    assert(typeof request.serviceName === 'string' &&
        request.serviceName !== '',
        'req.serviceName must be a string');

    var stringifyResult = self._stringify({
        head: outHead,
        body: outBody,
        endpoint: endpoint,
        direction: 'out.request'
    });
    if (stringifyResult.err) {
        return callback(stringifyResult.err);
    }

    // Punch as=thrift into the transport headers
    request.headers.as = 'thrift';

    request.send(
        endpoint,
        stringifyResult.value.head,
        stringifyResult.value.body,
        handleResponse
    );

    function handleResponse(err, res, arg2, arg3) {
        if (err) {
            return callback(err);
        }

        var parseResult = self._parse({
            head: arg2,
            body: arg3,
            ok: res.ok,
            endpoint: endpoint,
            direction: 'in.response'
        });

        if (parseResult.err) {
            return callback(parseResult.err);
        }

        var v = parseResult.value;
        var resp;

        if (res.ok) {
            resp = new TChannelThriftResponse(res.ok, v.head, v.body);
        } else {
            resp = new TChannelThriftResponse(
                res.ok, v.head, errors.ReconstructedError(v.body)
            );
        }

        callback(null, resp);
    }
};

TChannelAsThrift.prototype._parse = function parse(opts) {
    var self = this;

    var argsName = opts.endpoint + '_args';
    var argsType = self.spec.getType(argsName);

    var returnName = opts.endpoint + '_result';
    var resultType = self.spec.getType(returnName);

    var headR = bufrw.fromBufferResult(HeaderRW, opts.head);
    if (headR.err) {
        var headParseErr = errors.ThriftHeadParserError(headR.err, {
            endpoint: opts.endpoint,
            direction: opts.direction,
            ok: opts.ok,
            headBuf: opts.head.slice(0, 10)
        });

        if (self.logParseFailures) {
            self.logger.warn('Got unexpected invalid thrift arg2', {
                endpoint: opts.endpoint,
                direction: opts.direction,
                ok: opts.ok,
                headErr: headParseErr
            });
        }

        return new Result(headParseErr);
    }

    var bodyR;
    if (opts.direction === 'in.request') {
        bodyR = argsType.fromBuffer(opts.body);
    } else if (opts.direction === 'in.response') {
        bodyR = resultType.fromBuffer(opts.body);

        if (bodyR.value && opts.ok) {
            bodyR.value = bodyR.value.success;
        } else if (bodyR.value && !opts.ok) {
            bodyR.value = onlyProperty(bodyR.value);
        }
    }

    if (bodyR.err) {
        var bodyParseErr = errors.ThriftBodyParserError(bodyR.err, {
            endpoint: opts.endpoint,
            direction: opts.direction,
            ok: opts.ok,
            bodyBuf: opts.body.slice(0, 10)
        });

        if (self.logParseFailures) {
            self.logger.warn('Got unexpected invalid thrift for arg3', {
                endpoint: opts.endpoint,
                ok: opts.ok,
                direction: opts.direction,
                bodyErr: bodyParseErr
            });
        }

        return new Result(bodyParseErr);
    }

    var headers = {};
    for (var i = 0; i < headR.value.length; i++) {
        var pair = headR.value[i];
        headers[pair[0]] = pair[1];
    }

    return new Result(null, {
        head: headers,
        body: bodyR.value
    });
};

TChannelAsThrift.prototype._stringify = function stringify(opts) {
    var self = this;

    var argsName = opts.endpoint + '_args';
    var argsType = self.spec.getType(argsName);

    var returnName = opts.endpoint + '_result';
    var resultType = self.spec.getType(returnName);

    opts.head = opts.head || {};
    var headers = Object.keys(opts.head);

    var headerPairs = [];
    for (var i = 0; i < headers.length; i++) {
        headerPairs.push([headers[i], opts.head[headers[i]]]);
    }

    var headR = bufrw.toBufferResult(HeaderRW, headerPairs);
    if (headR.err) {
        var headStringifyErr = errors.ThriftHeadStringifyError(headR.err, {
            endpoint: opts.endpoint,
            ok: opts.ok,
            direction: opts.direction,
            head: opts.head
        });

        self.logger.error('Got unexpected unserializable thrift for arg2', {
            endpoint: opts.endpoint,
            ok: opts.ok,
            direction: opts.direction,
            headErr: headStringifyErr
        });
        return new Result(headStringifyErr);
    }

    var bodyR;
    if (opts.direction === 'out.request') {
        bodyR = argsType.toBuffer(opts.body);
    } else if (opts.direction === 'out.response') {
        var thriftResult = {};
        if (!opts.ok) {
            thriftResult[opts.body.nameAsThrift] = opts.body;
        } else {
            thriftResult.success = opts.body;
        }

        bodyR = resultType.toBuffer(thriftResult);
    }

    if (bodyR.err) {
        var bodyStringifyErr = errors.ThriftBodyStringifyError(bodyR.err, {
            endpoint: opts.endpoint,
            ok: opts.ok,
            direction: opts.direction,
            body: opts.body
        });

        self.logger.error('Got unexpected unserializable thrift for arg3', {
            endpoint: opts.endpoint,
            direction: opts.direction,
            ok: opts.ok,
            bodyErr: bodyStringifyErr
        });
        return new Result(bodyStringifyErr);
    }

    return new Result(null, {
        head: headR.value,
        body: bodyR.value
    });
};

function TChannelThriftResponse(ok, head, body) {
    var self = this;
    self.ok = ok;
    self.head = head;
    self.body = body;
}

// TODO proper Thriftify result union that reifies as the selected field.
function onlyProperty(object) {
    for (var name in object) {
        if (object[name] !== null) {
            object[name].nameAsThrift = name;
            return object[name];
        }
    }
}

function isError(err) {
    return Object.prototype.toString.call(err) === '[object Error]';
}
