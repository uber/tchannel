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

module.exports = TChannelAsThrift;

function TChannelAsThrift(opts) {
    var self = this;
    assert(opts && opts.spec, 'TChannelAsThrift expected spec');
    self.spec = opts.spec;
}

TChannelAsThrift.prototype.register =
function register(channel, name, opts, handle) {
    var self = this;

    var argsName = name + '_args';
    var argsType = self.spec.getType(argsName);

    var returnName = name + '_result';
    var resultType = self.spec.getType(returnName);

    channel.register(name, handleThriftRequest);

    function handleThriftRequest(req, res, inHeadBuffer, inBodyBuffer) {

        if (req.headers.as !== 'thrift') {
            return res.sendError('BadRequest', 'Expected as=thrift TChannel request header');
        }

        // Process incoming thrift body
        var inBodyResult = argsType.fromBuffer(inBodyBuffer);
        if (inBodyResult.err) {
            return res.sendError('BadRequest', inBodyResult.err.message);
        }
        var inBody = inBodyResult.value;

        // TODO process inHeadBuffer into inHead
        var inHead = null;

        handle(opts, req, inHead, inBody, handleThriftResponse);

        function handleThriftResponse(err, thriftRes) {
            if (err) {
                return res.sendError('UnexpectedError', err.message);
            }

            assert(typeof thriftRes.ok === 'boolean',
                'expected response.ok to be a boolean');

            var outResult = {};
            var outBody = thriftRes.body;
            if (!thriftRes.ok) {
                outResult[outBody.nameAsThrift] = outBody;
            } else {
                outResult.success = outBody;
            }

            var outRes = resultType.toBuffer(outResult);

            var outBodyBuffer = outRes.toValue();
            if (thriftRes.ok) {
                return res.sendOk(null, outBodyBuffer);
            } else {
                return res.sendNotOk(null, outBodyBuffer);
            }
        }
    }
};

/* jshint maxparams:5 */
TChannelAsThrift.prototype.send =
function send(request, endpoint, outHead, outBody, callback) {
    var self = this;

    assert(typeof endpoint === 'string', 'send requires endpoint');

    var argsType = self.spec.getType(endpoint + '_args');
    var resultType = self.spec.getType(endpoint + '_result');

    var outRes = argsType.toBuffer(outBody);
    if (outRes.err) {
        callback(outRes.err, null);
        return;
    }

    var outHeadBuffer = null;
    var outBodyBuffer = outRes.value;

    // Punch as=thrift into the transport headers
    request.headers.as = "thrift";

    request.send(endpoint, outHeadBuffer, outBodyBuffer, handleResponse);

    function handleResponse(err, res, arg2, arg3) {
        if (err) {
            return callback(err);
        }

        var inBodyResult = resultType.fromBuffer(arg3);
        if (inBodyResult.err) {
            return inBodyResult.toCallback(callback); // TODO WrappedError
        }

        var inBody;
        if (res.ok) {
            inBody = inBodyResult.value.success;
        } else {
            inBody = onlyProperty(inBodyResult.value);
        }

        // TODO translate inHeadBuffer into inHead
        // var inHeadBuffer = arg2;
        var inHead = null;

        callback(null, new Response(res.ok, inHead, inBody));
    }

};

function Response(ok, head, body) {
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
