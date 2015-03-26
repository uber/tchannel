// Copyright (c) 2015 Uber Technologies, Inc.

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

var NodeSol = require('nodesol').NodeSol;
var Ready = require('ready-signal');
var thriftify = require('thriftify');
var zipkinSpec = thriftify.newSpec(path.join(__dirname, 'zipkin.thrift'));

function KafkaTraceReporter(options) {
    if (!(this instanceof KafkaTraceReporter)) {
        return new KafkaTraceReporter(options);
    }
    var self = this;

    self.topic = options.topic;
    self.host = options.host;
    self.port = options.port;

    self.ready = Ready();

    self.nodesol = new NodeSol({host: self.host, port: self.port});
    self.nodesol.connect(self.ready.signal);
}

function jsonSpanToThriftSpan(span) {
    var annotations = span.annotations.map(function fixAnnotation(item) {
        return {
            timestamp: item.timestamp / 1000,
            value: item.value,
            host: {
                ipv4: item.endpoint.ipv4,
                port: item.endpoint.port,
                service_name: item.endpoint.serviceName
            }
        };
    });

    var mapped = {
        trace_id: span.traceid,
        parent_id: span.parentid,
        id: span.id,
        annotations: annotations,
        binary_annotations: []  // TODO
    };

    return mapped;
}

KafkaTraceReporter.prototype.report = function report(span) {
    var self = this;

    var base64ThriftSpan = thriftify
        .toBuffer(jsonSpanToThriftSpan(span), zipkinSpec, 'Span')
        .toString('base64');

    self.ready(function () {
        self.nodesol.produce(self.topic, base64ThriftSpan);
    });
};

