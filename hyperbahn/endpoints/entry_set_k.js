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
    var logger = opts.clients.logger;

    if (!body ||
        !body.serviceName ||
        typeof body.serviceName !== 'string' ||
        body.serviceName.indexOf('~') !== -1
    ) {
        return cb(null, {
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

    entryNode.fanoutSetK({
        serviceName: serviceName,
        k: k,
        inreq: req
    }, onFannedOut);

    function onFannedOut(err, result) {
        if (err) {
            logger.error('unexpected set_k error', {
                error: err,
                serviceName: serviceName,
                k: k
            });
            return cb(err);
        }

        cb(null, {
            ok: true,
            head: null,
            body: result
        });
    }
}
