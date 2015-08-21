'use strict';

module.exports = circuitsEndpoint;

function circuitsEndpoint(opts, req, head, body, cb) {
    var circuits = opts.clients.serviceProxy.circuits;

    var response = [];

    var circuitTuples = circuits ? circuits.getCircuitTuples() : [];
    for (var index = 0; index < circuitTuples.length; index++) {
        var circuitTuple = circuitTuples[index];
        var circuit = circuits.getCircuit.apply(circuits, circuitTuple);
        var state = circuit.state.type;
        response.push({
            cn: circuit.callerName,
            sn: circuit.serviceName,
            en: circuit.endpointName,
            healthy: state === 'tchannel.healthy' || state === 'tchannel.healthy-locked',
            locked: state === 'tchannel.healthy-locked' || state === 'tchannel.unhealthy-locked'
        });
    }

    cb(null, {
        ok: true,
        head: null,
        body: response
    });
}
