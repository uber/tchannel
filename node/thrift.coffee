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

TChannelAsThrift = (opts) ->
    self = this
    assert opts and opts.spec, 'TChannelAsThrift expected spec'
    self.spec = opts.spec
    return

Response = (ok, head, body) ->
    self = this
    self.ok = ok
    self.head = head
    self.body = body
    return

# TODO proper Thriftify result union that reifies as the selected field.

onlyProperty = (object) ->
    for name of object
        if object[name] != null
            object[name].nameAsThrift = name
            return object[name]
    return

'use strict'
assert = require('assert')
module.exports = TChannelAsThrift

TChannelAsThrift::register = (channel, name, opts, handle) ->
    self = this
    argsName = name + '_args'
    argsType = self.spec.getType(argsName)
    returnName = name + '_result'
    resultType = self.spec.getType(returnName)

    handleThriftRequest = (req, res, inHeadBuffer, inBodyBuffer) ->

        handleThriftResponse = (err, thriftRes) ->
            if err
                return res.sendError('UnexpectedError', err.message)
            # TODO {head,body} or {arg2,arg3}?
            ok = thriftRes.ok
            outBody = thriftRes.body
            if typeof ok != 'boolean'
                throw new Error('Expected true or false boolean on response object')
            outResult = {}
            if ok
                outResult.success = outBody
            else if !outBody
                throw new Error('Error body required in the not ok response case')
                # TODO TypedError
            else if typeof outBody.nameAsThrift != 'string'
                throw new Error('Can\'t serialize error response that lacks nameAsThrift')
                # TODO TypedError
            else if !resultType.fieldsByName[outBody.nameAsThrift]
                throw new Error('Can\'t serialize error response with unrecognized nameAsThrift: ' + outBody.nameAsThrift)
                # TODO TypedError
            else
                outResult[outBody.nameAsThrift] = outBody
            # outBody must be a Thrift result, e.g., {success: value}, or
            # {oops: {}}.
            # This will throw locally if the response body is malformed.
            outBodyBuffer = resultType.toBuffer(outResult).toValue()
            # TODO process outHeadBuffer
            # var outHead = res.head;
            outHeadBuffer = null
            if ok
                res.sendOk outHeadBuffer, outBodyBuffer
            else
                res.sendNotOk outHeadBuffer, outBodyBuffer

        if req.headers.as != 'thrift'
            return res.sendError('BadRequest', 'Expected as=thrift TChannel request header')
        # Process incoming thrift body
        inBodyResult = argsType.fromBuffer(inBodyBuffer)
        if inBodyResult.err
            return res.sendError('BadRequest', inBodyResult.err.message)
        inBody = inBodyResult.value
        # TODO process inHeadBuffer into inHead
        inHead = null
        handle opts, req, inHead, inBody, handleThriftResponse
        return

    channel.register name, handleThriftRequest
    return

### jshint maxparams:5 ###

TChannelAsThrift::send = (request, endpoint, outHead, outBody, callback) ->
    self = this

    handleResponse = (err, res, arg2, arg3) ->
        if err
            return callback(err)
        inBodyResult = resultType.fromBuffer(arg3)
        if inBodyResult.err
            return inBodyResult.toCallback(callback)
            # TODO WrappedError
        inBody = undefined
        if res.ok
            inBody = inBodyResult.value.success
        else
            inBody = onlyProperty(inBodyResult.value)
        # TODO translate inHeadBuffer into inHead
        # var inHeadBuffer = arg2;
        inHead = null
        callback null, new Response(res.ok, inHead, inBody)
        return

    assert typeof endpoint == 'string', 'send requires endpoint'
    argsType = self.spec.getType(endpoint + '_args')
    resultType = self.spec.getType(endpoint + '_result')
    # This will throw locally if the body is malformed.
    outBodyBuffer = argsType.toBuffer(outBody).toValue()
    # TODO outHeadBuffer from outHead
    outHeadBuffer = null
    # Punch as=thrift into the transport headers
    request.headers.as = 'thrift'
    request.send endpoint, outHeadBuffer, outBodyBuffer, handleResponse
    return
