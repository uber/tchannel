'use strict';

var TypedError = require('error/typed');

module.exports = serviceHostsConnectionsEndpoint;

var BodyRequired = TypedError({
    type: 'autobahn.service-hosts-connections.body-missing',
    message: 'Autobahn: service-hosts-connections endpoint requires ' +
        'JSON request body'
});

var ServiceNameRequired = TypedError({
    type: 'autobahn.service-hosts-connections.service-name-required',
    message: 'Autobahn: service-hosts-connections endpoint requires ' +
        'service name string'
});

var ServiceNameInvalid = TypedError({
    type: 'autobahn.service-hosts-connections.service-name-invalid',
    message: 'Autobahn: service-hosts-connections endpoint requires valid ' +
        'service name [a-zA-Z0-9-_]+, got {serviceName}',
    serviceName: null
});

var serviceNameExpression = /^[a-zA-Z0-9-_]+$/;

function serviceHostsConnectionsEndpoint(opts, req, head, body, cb) {
    var entryNode = opts.services.entryNode;
    var logger = opts.clients.logger;

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

    // TODO handle edge case where ringpop returns itself
    // instead of null.

    // This prints [localNode] for non-existant services

    entryNode.getHostsConnectionsForService({
        serviceName: serviceName,
        inreq: req
    }, onResult);

    function onResult(err, hostsConnections) {
        // istanbul ignore if
        if (err) {
            logger.error('Unexpected service host connections error', {
                error: err
            });

            return cb(err);
        }

        cb(null, {
            ok: true,
            head: null,
            body: hostsConnections
        });
    }
}
