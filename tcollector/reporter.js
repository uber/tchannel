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

var path = require('path');
var fs = require('fs');

var tcollectorSpec = fs.readFileSync(
    path.join(__dirname, 'tcollector.thrift'), 'utf8'
);

module.exports = TCollectorTraceReporter;

function TCollectorTraceReporter(options) {
    if (!(this instanceof TCollectorTraceReporter)) {
        return new TCollectorTraceReporter(options);
    }
    var self = this;

    self.logger = options.logger;
    self.channel = options.channel;

    if (!self.channel) {
        // TODO: typederror or vld
        throw new Error('TCollectorTraceReporter must be passed a tchannel');
    }

    self.tchannelThrift = self.channel.TChannelAsThrift({
        source: tcollectorSpec
    });
}

function ipToInt(ip) {
    var ipl = 0;
    var parts = ip.split('.');
    for (var i = 0; i < parts; i++) {
        ipl <<= 8;
        ipl += parseInt(parts[i], 10);
    }
    return (ipl >>> 0);
}

function convertHost(endpoint) {
    return {
        ipv4: ipToInt(endpoint.ipv4),
        port: endpoint.port,
        serviceName: endpoint.serviceName
    }
}

function jsonSpanToThriftSpan(span) {
    /*jshint camelcase: false*/

    var annotations = span.annotations.map(function fixAnnotation(item) {
        return {
            timestamp: item.timestamp,
            value: item.value
        };
    });

    var binaryAnnotations =
        span.binaryAnnotations.map(function fixBinAnnotation(item) {
            var ret = {
                key: item.key
            }

            if (item.type === 'boolean') {
                ret.annotationType = 'BOOL';
                ret.boolValue = item.value;
            }

            else if (item.type === 'number') {
                ret.annotationType = 'DOUBLE';
                ret.doubleValue = item.value;
            }

            else {
                ret.annotationType = 'STRING'
                ret.stringValue = String(item.value);
            }

            return ret;
        });

    if (!span.host) {
        // Workaround to support older tchannels
        span.host = convertHost(span.annotations[0].host);
    }

    var mapped = {
        name: span.name,
        traceId: span.traceid,
        parentId: span.parentid,
        id: span.id,
        annotations: annotations,
        binaryAnnotations: binaryAnnotations,
        host: span.host
    };

    return mapped;
}

TCollectorTraceReporter.prototype.report = function report(span, callback) {
    var self = this;

    var req = self.channel.request({
        timeout: 100,
        trace: false,
        hasNoParent: true,
        headers:{
            cn: "tcollector-reporter",
            shardKey: span.traceid.toString('base64')
        },
        serviceName: 'tcollector',
        retryLimit: 1,
        retryFlags: {never: true}
    });

    self.tchannelThrift.send(
        req,
        'TCollector::submit',
        null,
        {span: jsonSpanToThriftSpan(span)},
        function (err, response) {
            if (err) {
                self.logger.warn("Zipkin span submit failed", {
                    err: err
                });
                if (callback) {
                    callback(err);
                }
                return;
            }

            if (!response.ok) {
                self.logger.warn("Zipkin span submit failed: not ok", {
                    response: response
                });
            }

            if (callback) {
                callback();
            }
        }
    );
};

