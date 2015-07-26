'use strict';

var TypedError = require('error/typed');

module.exports = serviceHostsEndpoint;

var BodyRequired = TypedError({
    type: 'autobahn.service-hosts.body-missing',
    message: 'Autobahn: service-hosts endpoint requires JSON request body'
});

var ServiceNameRequired = TypedError({
    type: 'autobahn.service-hosts.service-name-required',
    message: 'Autobahn: service-hosts endpoint requires service name string'
});

var ServiceNameInvalid = TypedError({
    type: 'autobahn.service-hosts.service-name-invalid',
    message: 'Autobahn: service-hosts endpoint requires valid service name ' +
        '[a-zA-Z0-9-_]+, got {serviceName}',
    serviceName: null
});

var serviceNameExpression = /^[a-zA-Z0-9-_]+$/;

function serviceHostsEndpoint(opts, req, head, body, cb) {
    var egressNodes = opts.clients.egressNodes;

    if (body === null || typeof body !== 'object') {
        return cb(null, {
            ok: false,
            head: null,
            body: BodyRequired()
        });
    }

    var serviceName = body.serviceName;
    if (typeof serviceName !== 'string') {
        return cb(null, {
            ok: false,
            head: null,
            body: ServiceNameRequired()
        });
    }

    if (!serviceNameExpression.test(serviceName)) {
        return cb(null, {
            ok: false,
            head: null,
            body: ServiceNameInvalid({
                serviceName: serviceName
            })
        });
    }

    var exitNodes = egressNodes.exitsFor(serviceName);
    var serviceHosts = Object.keys(exitNodes);

    // TODO handle edge case where ringpop returns itself
    // instead of null.

    // This prints [localNode] for non-existant services

    cb(null, {
        ok: true,
        head: null,
        body: serviceHosts
    });
}
