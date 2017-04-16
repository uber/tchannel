# Copyright (c) 2015 Uber Technologies, Inc.
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in
# all copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
# THE SOFTWARE.

TChannelJSON = (options) ->
    if !(this instanceof TChannelJSON)
        return new TChannelJSON(options)
    self = this
    self.logger = options and options.logger or NullLogtron()
    strictMode = options and options.strictMode
    self.strictMode = if typeof strictMode == 'boolean' then strictMode else true
    logParseFailures = options and options.logParseFailures
    self.logParseFailures = if typeof logParseFailures == 'boolean' then logParseFailures else true
    return

TChannelJSONResponse = (ok, head, body) ->
    self = this
    self.ok = ok
    self.head = head
    self.body = body
    return

safeJSONStringify = (obj) ->
    str = undefined
    # jscs:disable
    try
        str = JSON.stringify(obj)
    catch e
        return new Result(e)
    # jscs:enable
    new Result(null, str)

safeJSONParse = (str) ->
    if str == ''
        return new Result(null, null)
    json = undefined
    # jscs:disable
    try
        json = JSON.parse(str)
    catch e
        return new Result(e)
    # jscs:enable
    new Result(null, json)

'use strict'

### jshint maxparams:5 ###

Buffer = require('buffer').Buffer
assert = require('assert')
NullLogtron = require('null-logtron')
Result = require('bufrw/result')
cyclicStringify = require('json-stringify-safe')
isError = require('is-error')
errors = require('../errors.js')
module.exports = TChannelJSON

###eslint max-params: [2, 5]###

TChannelJSON::send = (req, endpoint, head, body, callback) ->
    self = this

    onResponse = (err, resp, arg2, arg3) ->
        if err
            return callback(err)
        parseResult = self._parse(
            head: arg2.toString('utf8')
            body: arg3.toString('utf8')
            endpoint: endpoint
            direction: 'in.response')
        if parseResult.err
            return callback(parseResult.err)
        v = parseResult.value
        response = null
        if resp.ok
            response = new TChannelJSONResponse(resp.ok, v.head, v.body)
        else
            response = new TChannelJSONResponse(resp.ok, v.head, errors.ReconstructedError(v.body))
        callback null, response
        return

    assert typeof endpoint == 'string', 'endpoint must be a string'
    assert typeof req.service == 'string' and req.service != '', 'req.service must be a string'
    assert body != undefined, 'must send a body'
    stringifyResult = self._stringify(
        head: head
        body: body
        endpoint: endpoint
        direction: 'out.request')
    if stringifyResult.err
        return callback(stringifyResult.err)
    req.headers.as = 'json'
    req.send new Buffer(endpoint), new Buffer(stringifyResult.value.head or ''), new Buffer(stringifyResult.value.body or ''), onResponse
    return

TChannelJSON::register = (tchannel, arg1, opts, handlerFunc) ->
    self = this

    endpointHandler = (req, res, arg2, arg3) ->

        onResponse = (err, respObject) ->
            if err
                assert isError(err), 'Error argument must be an error'
                self.logger.error 'Got unexpected error in handler',
                    endpoint: arg1
                    err: err
                return res.sendError('UnexpectedError', 'Unexpected Error')
            assert typeof respObject.ok == 'boolean', 'expected respObject to have an `ok` boolean'
            assert respObject.body != undefined, 'expected respObject to have a body'
            # Assert that body is an error
            if !respObject.ok and self.strictMode == true
                if !isError(respObject.body) or typeof respObject.body.type != 'string'
                    throw new Error('expected body to be a typed error')
            stringifyResult = self._stringify(
                head: respObject.head
                body: respObject.body
                endpoint: arg1
                direction: 'out.response')
            if stringifyResult.err
                return res.sendError('UnexpectedError', 'Could not JSON stringify')
            res.setOk respObject.ok
            res.send stringifyResult.value.head, stringifyResult.value.body
            return

        if req.headers.as != 'json'
            message = 'Expected call request as header to be json'
            return res.sendError('BadRequest', message)
        parseResult = self._parse(
            head: arg2.toString('utf8')
            body: arg3.toString('utf8')
            endpoint: arg1
            direction: 'in.request')
        if parseResult.err
            message2 = parseResult.err.type + ': ' + parseResult.err.message
            return res.sendError('BadRequest', message2)
        v = parseResult.value
        handlerFunc opts, req, v.head, v.body, onResponse
        return

    tchannel.register arg1, endpointHandler
    return

TChannelJSON::_stringify = (opts) ->
    self = this
    headR = safeJSONStringify(opts.head)
    if headR.err
        headStringifyErr = errors.HeadStringifyError(headR.err,
            endpoint: opts.endpoint
            direction: opts.direction
            head: cyclicStringify(opts.head))
        self.logger.error 'Got unexpected unserializable JSON for arg2',
            endpoint: opts.endpoint
            direction: opts.direction
            headErr: headStringifyErr
        return new Result(headStringifyErr)
    bodyR = safeJSONStringify(opts.body)
    if bodyR.err
        bodyStringifyErr = errors.BodyStringifyError(bodyR.err,
            endpoint: opts.endpoint
            direction: opts.direction
            body: cyclicStringify(opts.body))
        self.logger.error 'Got unexpected unserializable JSON for arg3',
            endpoint: opts.endpoint
            direction: opts.direction
            bodyErr: bodyStringifyErr
        return new Result(bodyStringifyErr)
    new Result(null,
        head: headR.value
        body: bodyR.value)

TChannelJSON::_parse = (opts) ->
    self = this
    headR = safeJSONParse(opts.head)
    if headR.err
        headParseErr = errors.HeadParserError(headR.err,
            endpoint: opts.endpoint
            direction: opts.direction
            headStr: opts.head.slice(0, 10))
        if self.logParseFailures
            self.logger.warn 'Got unexpected invalid JSON for arg2',
                endpoint: opts.endpoint
                direction: opts.direction
                headErr: headParseErr
        return new Result(headParseErr)
    bodyR = safeJSONParse(opts.body)
    if bodyR.err
        bodyParseErr = errors.BodyParserError(bodyR.err,
            endpoint: opts.endpoint
            direction: opts.direction
            bodyStr: opts.body.slice(0, 10))
        if self.logParseFailures
            self.logger.warn 'Got unexpected invalid JSON for arg3',
                endpoint: opts.endpoint
                direction: opts.direction
                bodyErr: bodyParseErr
        return new Result(bodyParseErr)
    new Result(null,
        head: headR.value
        body: bodyR.value)
