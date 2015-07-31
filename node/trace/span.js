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

var LCG = require('../lib/lcg');

var rng = new LCG();

module.exports = Span;
module.exports.Endpoint = Endpoint;
module.exports.Annotation = Annotation;
module.exports.BinaryAnnotation = BinaryAnnotation;

function Span(options) {
    if (!(this instanceof Span)) {
        return new Span(options);
    }
    var self = this;

    // TODO: options validation

    if (options.id) {
        self.id = options.id;
    }

    if (options.traceid) {
        self.traceid = options.traceid;
    }

    self.endpoint = options.endpoint;

    self.name = options.name;
    self.parentid = options.parentid;
    if (!options.parentid) {
        self.parentid = new Buffer(8);
        self.parentid.fill(0);
    }
    self.annotations = [];
    self.binaryAnnotations = [];
    self.serviceName = options.serviceName;
    self.flags = options.flags;
}

Span.prototype.toString = function toString() {
    var self = this;

    var strAnnotations = self.annotations.map(function (ann) {
        return "[" + ann.value + " " + ann.timestamp + "]";
    }).join(' ');

    return "SPAN: traceid: " + self.traceid.toString('hex') + " spanid: " +
        self.id.toString('hex') + " parentid: " +
        self.parentid.toString('hex') + " name: " + self.name +
        " servicename: " + self.endpoint.serviceName + 
        " annotations: " + strAnnotations;
};

Span.prototype.toJSON = function toJSON() {
    var self = this;
    return {
        name: self.name,
        endpoint: self.endpoint,
        traceid: self.traceid.toString('hex'),
        parentid: self.parentid.toString('hex'),
        spanid: self.id.toString('hex'),
        annotations: self.annotations,
        binaryAnnotations: self.binaryAnnotations
    };
};

// Generate a trace/span id for this span
Span.prototype.generateIds = function generateIds() {
    var self = this;

    self.id = self.traceid = rng.rand64();
};

// Generate just a span id
Span.prototype.generateSpanid = function generateSpanid() {
    var self = this;

    self.id = rng.rand64();
};

// ##
Span.prototype.propagateIdsFrom = function propagateIdsFrom(span) {
    var self = this;

    self.parentid = span.id;
    self.traceid = span.traceid;
    self.flags = span.flags;
};

Span.prototype.getTracing = function getTracing() {
    var self = this;

    return {
        spanid: self.id,
        traceid: self.traceid,
        parentid: self.parentid,
        flags: self.flags
    };
};

Span.prototype.annotate = function annotate(value, timestamp) {
    var self = this;

    timestamp = timestamp || Date.now();

    self.annotations.push(new Annotation(value, self.endpoint, timestamp));
};

Span.prototype.annotateBinary =
function annotateBinary(key, value, type) {
    var self = this;

    self.binaryAnnotations.push(new BinaryAnnotation(key, value, type, self.endpoint));
};

function Endpoint(ipv4, port, serviceName) {
    if (!(this instanceof Endpoint)) {
        return new Endpoint(ipv4, port, serviceName);
    }
    var self = this;

    self.ipv4 = ipv4;
    self.port = port;
    self.serviceName = serviceName;
}

function Annotation(value, host, timestamp) {
    if (!(this instanceof Annotation)) {
        return new Annotation(value, host, timestamp);
    }
    var self = this;

    // TODO: validation

    self.value = value;
    self.timestamp = timestamp || Date.now();
    self.host = host;
}

function BinaryAnnotation(key, value, type, host) {
    if (!(this instanceof BinaryAnnotation)) {
        return new BinaryAnnotation(key, value, type, host);
    }
    var self = this;

    // TODO: validation

    self.key = key;
    self.value = value;
    self.type = type? type : typeof value;
    self.host = host;
}

