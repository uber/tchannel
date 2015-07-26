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
