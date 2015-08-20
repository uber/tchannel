'use strict';

module.exports = serviceConnectionsEndpoint;

function serviceConnectionsEndpoint(opts, req, head, body, cb) {
    var exitNode = opts.services.exitNode;
    var serviceName = body.serviceName;
    var serviceConnections = exitNode.getServiceConnections(serviceName);

    cb(null, {
        ok: true,
        head: null,
        body: serviceConnections
    });
}
