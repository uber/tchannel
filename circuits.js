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

"use strict";

var inherits = require('util').inherits;
var states = require('./states');
var EventEmitter = require('./lib/event_emitter');
var StateMachine = require('./state_machine');
var errors = require('./errors');

// Each circuit uses the circuits collection as the "nextHandler" for
// "shouldRequest" to consult.  Peers use this hook to weight peers both by
// healthy and other factors, but the circuit only needs to know about health
// before forwarding.

function AlwaysShouldRequestHandler() { }

AlwaysShouldRequestHandler.prototype.shouldRequest = function shouldRequest() {
    return true;
};

var alwaysShouldRequestHandler = new AlwaysShouldRequestHandler();

function CircuitStateChange(circuit, oldState, state) {
    var self = this;
    self.circuit = circuit;
    self.oldState = oldState;
    self.state = state;
}

//  circuit = circuits                        : Circuits
//      .circuitsByServiceName[serviceName]   : ServiceCircuits
//      .circuitsByCallerName[callerName]     : EndpointCircuits
//      .circuitsByEndpointName[endpointName]

function EndpointCircuits(root) {
    var self = this;
    self.root = root;
    self.circuitsByEndpointName = {};
}

EndpointCircuits.prototype.getCircuit = function getCircuit(callerName, serviceName, endpointName) {
    var self = this;
    var circuit = self.circuitsByEndpointName['$' + endpointName];
    if (!circuit) {
        circuit = new Circuit(callerName, serviceName, endpointName);
        circuit.shouldRequestOptions = self.root.shouldRequestOptions;
        circuit.stateOptions = new states.StateOptions(circuit, self.root.stateOptions);
        circuit.stateChangedEvent.on(function circuitStateChanged(states) {
            self.root.emitCircuitStateChange(circuit, states);
        });
        circuit.setState(states.HealthyState);
        self.circuitsByEndpointName['$' + endpointName] = circuit;
    }
    return circuit;
};

EndpointCircuits.prototype.collectCircuitTuples = function collectCircuitTuples(tuples) {
    var self = this;
    var endpointNames = Object.keys(self.circuitsByEndpointName);
    for (var index = 0; index < endpointNames.length; index++) {
        var endpointName = endpointNames[index];
        var circuit = self.circuitsByEndpointName[endpointName];
        tuples.push([circuit.callerName, circuit.serviceName, circuit.endpointName]);
    }
};

function ServiceCircuits(root) {
    var self = this;
    self.root = root;
    self.circuitsByCallerName = {};
}

ServiceCircuits.prototype.getCircuit = function getCircuit(callerName, serviceName, endpointName) {
    var self = this;
    var circuits = self.circuitsByCallerName['$' + callerName];
    if (!circuits) {
        circuits = new EndpointCircuits(self.root);
        self.circuitsByCallerName['$' + callerName] = circuits;
    }
    return circuits.getCircuit(callerName, serviceName, endpointName);
};

ServiceCircuits.prototype.collectCircuitTuples = function collectCircuitTuples(tuples) {
    var self = this;
    var callerNames = Object.keys(self.circuitsByCallerName);
    for (var index = 0; index < callerNames.length; index++) {
        var callerName = callerNames[index];
        var circuit = self.circuitsByCallerName[callerName];
        circuit.collectCircuitTuples(tuples);
    }
};

function Circuits(options) {
    var self = this;
    EventEmitter.call(self);
    self.circuitStateChangeEvent = self.defineEvent('circuitStateChange');
    self.circuitsByServiceName = {};
    self.config = options.config || {};

    self.stateOptions = new states.StateOptions(null, {
        timers: options.timers,
        random: options.random,
        nextHandler: alwaysShouldRequestHandler,
        period: self.config.period,
        maxErrorRate: self.config.maxErrorRate,
        minRequests: self.config.minRequests,
        probation: self.config.probation
    });
    self.shouldRequestOptions = {};
    self.egressNodes = options.egressNodes;
}

inherits(Circuits, EventEmitter);

Circuits.prototype.getCircuit = function getCircuit(callerName, serviceName, endpointName) {
    var self = this;
    var circuits = self.circuitsByServiceName['$' + serviceName];
    if (!circuits) {
        circuits = new ServiceCircuits(self);
        self.circuitsByServiceName['$' + serviceName] = circuits;
    }
    return circuits.getCircuit(callerName, serviceName, endpointName);
};

Circuits.prototype.getCircuitTuples = function getCircuitTuples() {
    var self = this;
    var tuples = [];
    var serviceNames = Object.keys(self.circuitsByServiceName);
    for (var index = 0; index < serviceNames.length; index++) {
        var serviceName = serviceNames[index];
        self.circuitsByServiceName[serviceName].collectCircuitTuples(tuples);
    }
    return tuples;
};

Circuits.prototype.handleRequest = function handleRequest(req, buildRes, nextHandler) {
    var self = this;
    // Default the caller name.
    // All callers that fail to specifiy a cn share a circuit for each sn:en
    // and fail together.
    var callerName = req.headers.cn || 'no-cn';
    var serviceName = req.serviceName;
    if (!serviceName) {
        return buildRes().sendError('BadRequest', 'All requests must have a service name');
    }
    return req.withArg1(function withArg1() {
        var circuit = self.getCircuit(callerName, serviceName, String(req.arg1));
        return circuit.handleRequest(req, buildRes, nextHandler);
    });
};

// Called upon membership change to collect services that the corresponding
// exit node is no longer responsible for.
Circuits.prototype.updateServices = function updateServices() {
    var self = this;
    var serviceNames = Object.keys(self.circuitsByServiceName);
    for (var index = 0; index < serviceNames.length; index++) {
        var serviceName = serviceNames[index];
        if (!self.egressNodes.isExitFor(serviceName)) {
            delete self.circuitsByServiceName[serviceName];
        }
    }
};

Circuits.prototype.emitCircuitStateChange = function (circuit, states) {
    var self = this;
    self.circuitStateChangeEvent.emit(
        self.root,
        new CircuitStateChange(circuit, states[0], states[1])
    );
};

function Circuit(callerName, serviceName, endpointName) {
    var self = this;
    EventEmitter.call(self);
    StateMachine.call(self);
    self.stateChangedEvent = self.defineEvent('stateChanged');
    self.callerName = callerName || 'no-cn';
    self.serviceName = serviceName;
    self.endpointName = endpointName;
    self.shouldRequestOptions = null;
    self.stateOptions = null;
}

inherits(Circuit, EventEmitter);

Circuit.prototype.setState = StateMachine.prototype.setState;

Circuit.prototype.handleRequest = function handleRequest(req, buildRes, nextHandler) {
    var self = this;
    if (self.state.shouldRequest(req, self.shouldRequestOptions)) {
        return self.monitorRequest(req, buildRes, nextHandler);
    } else {
        return buildRes().sendError('Declined', 'Service is not healthy');
    }
};

Circuit.prototype.monitorRequest = function monitorRequest(req, buildRes, nextHandler) {
    var self = this;

    self.state.onRequest(req);

    req.errorEvent.on(onError);

    function monitorBuildRes(options) {
        var res = buildRes(options);
        self.monitorResponse(res);
        return res;
    }

    function onError(err) {
        self.state.onRequestError(err);
    }

    return nextHandler.handleRequest(req, monitorBuildRes);
};

Circuit.prototype.monitorResponse = function monitorResponse(res) {
    var self = this;

    res.errorEvent.on(onError);
    res.finishEvent.on(onFinish);

    function onError(err) {
        self.state.onRequestError(err);
    }

    function onFinish() {
        // TODO distingiush res.ok?
        // note that incoming requests do not have responseEvent and clear out
        // their response upon finish.
        if (errors.isUnhealthy(res.codeString)) {
            self.state.onRequestUnhealthy();
        } else {
            self.state.onRequestHealthy();
        }
    }
};

module.exports = Circuits;
