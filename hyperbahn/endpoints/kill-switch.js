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

var InvalidBodyType = TypedError({
    type: 'autobahn.register.invalid-body-type',
    message: 'Invalid body type',
    bodyType: null
});

var InvalidRequest = TypedError({
    type: 'autobahn.register.invalid-request',
    message: 'Both cn and serviceName should be provided',
    cn: null,
    serviceName: null
});

module.exports = killSwitch;

function killSwitch(opts, req, head, body, cb) {
    var serviceProxy = opts.clients.serviceProxy;

    if (!body) {
        return cb(null, {
            ok: false,
            head: null,
            body: InvalidBodyType({
                bodyType: null
            })
        });
    }

    if (body.type === 'query') {
        return cb(null, {
            ok: true,
            head: null,
            body: {blockingTable: serviceProxy.blockingTable}
        });
    }

    if (!body.cn || !body.serviceName) {
        return cb(null, {
            ok: false,
            head: null,
            body: InvalidRequest({
                cn: body.cn,
                serviceName: body.serviceName
            })
        });
    }

    if (body.type === 'block') {
        serviceProxy.block(body.cn, body.serviceName);
    } else if (body.type === 'unblock') {
        serviceProxy.unblock(body.cn, body.serviceName);
    } else {
        return cb(null, {
            ok: false,
            head: null,
            body: InvalidBodyType({
                bodyType: body.type
            })
        });
    }

    return cb(null, {
        ok: true,
        head: null,
        body: {blockingTable: serviceProxy.blockingTable}
    });
}
