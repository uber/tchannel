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

var InvalidServiceName = TypedError({
    type: 'autobahn.register.invalid-service-name',
    message: 'Invalid service name',
    serviceName: null
});

var InvalidK = TypedError({
    type: 'autobahn.register.invalid-k',
    message: 'Invalid k',
    k: null
});

module.exports = setK;

function setK(opts, req, head, body, cb) {
    var entryNode = opts.services.entryNode;

    if (!body ||
        !body.serviceName ||
        typeof body.serviceName !== 'string' ||
        body.serviceName.indexOf('~') !== -1
    ) {
        return cb({
            ok: false,
            head: null,
            body: InvalidServiceName({
                serviceName: body && body.serviceName
            })
        });
    }

    if (!body ||
        !body.k ||
        typeof body.k !== 'number' ||
        body.k !== body.k
    ) {
        return cb({
            ok: false,
            head: null,
            body: InvalidK({
                k: body && body.k
            })
        });
    }

    var serviceName = body.serviceName;
    var k = body.k;

    entryNode.setK(serviceName, k);

    cb(null, {
        ok: true,
        head: null,
        body: 'ok'
    });
}
