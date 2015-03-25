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

var Ready = require('ready-signal');
var crypto = require('crypto');
var NullLogtron = require('null-logtron');

module.exports = Span;
module.exports.Endpoint = Endpoint;
module.exports.Annotation = Annotation;
module.exports.BinaryAnnotation = BinaryAnnotation;

function mathRng(cb) {
    cb(null, Math.random() * 100000000000000000);
}

// TODO: do something better here
function cryptoRng(cb) {
    crypto.pseudoRandomBytes(8, cb);
}

function rng(logger, cb) {
    cryptoRng(function cryptoRngDone(err, data) {
        if (err) {
            logger.error('TChannel tracing: rng error', err);
            return mathRng(function (err, data) {
                // TODO: this is actually wrong and should store it into
                // a buffer, assuming crypto won't fail for now during
                // testing
                cb(data);
            });
        }

        cb(data);
    });
}

function Span(options) {
    if (!(this instanceof Span)) {
        return new Span(options);
    }
    var self = this;

    // TODO: options validation

    self.logger = options.logger || NullLogtron();

    self._idReady = Ready();
    self._traceidReady = Ready();

    if (options.id) {
        self.id = options.id;
        self._idReady.signal();
    }

    if (options.traceid) {
        self.traceid = options.traceid;
        self._traceidReady.signal();
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
}

Span.prototype.toString = function toString() {
    var self = this;

    var strAnnotations = self.annotations.map(function (ann) {
        return "[" + ann.value + " " + ann.timestamp + "]";
    }).join(' ');

    return "SPAN: traceid: " + self.traceid.toString('hex') + " spanid: " +
        self.id.toString('hex') + " parentid: " +
        self.parentid.toString('hex') + " name: " + self.name +
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

Span.prototype.ready = function ready(cb) {
    var self = this;
    self._traceidReady(function () {
        self._idReady(function () {
            cb();
        });
    });
};

// Generate a trace/span id for this span
Span.prototype.generateIds = function generateIds() {
    var self = this;

    rng(self.logger, function rngDone(data) {
        self.id = self.traceid = data;

        self._idReady.signal();
        self._traceidReady.signal();
    });
};

// Generate just a span id
Span.prototype.generateSpanid = function generateSpanid() {
    var self = this;

    rng(self.logger, function rngDone(data) {
        self.id = data;

        self._idReady.signal();
    });
};

// ##
Span.prototype.propagateIdsFrom = function propagateIdsFrom(span) {
    var self = this;

    span.ready(function spanReady() {
        self.parentid = span.id;
        self.traceid = span.traceid;

        self._traceidReady.signal();
    });
};

Span.prototype.getTracing = function getTracing() {
    var self = this;

    return {
        spanid: self.id,
        traceid: self.traceid,
        parentid: self.parentid,
        flags: 0
    };
};

Span.prototype.annotate = function annotate(value, timestamp) {
    var self = this;

    timestamp = timestamp || Date.now();

    self.annotations.push(Annotation(value, self.endpoint, timestamp));
};

Span.prototype.annotateBinary =
function annotateBinary(key, value, type) {
    var self = this;

    self.binaryAnnotations.push(BinaryAnnotation(key, value, type, self.endpoint));
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
        return new Annotation(value, host);
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

