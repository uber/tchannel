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

var DebugLogtron = require('debug-logtron');

var Span = require('./span');

module.exports = new Agent();

function Agent () {
    if (!(this instanceof Agent)) {
        return new Agent();
    }
    var self = this;

    if (!process.addAsyncListener) {
        require('async-listener');
    }

    self.currentSpan = null;

    self.asyncListener = process.createAsyncListener({
        create: function () {
            // Return the storage that should be scoped to the async operation
            // that was just created
            return self.currentSpan;
        },

        before: function (context, storage) {
            if (!self.currentSpan) {
                self.currentSpan = storage;
            }
        },

        after: function () {
            self.currentSpan = null;
        },

        error: function () {
            self.currentSpan = null;
        }
    });

    process.addAsyncListener(self.asyncListener);

    self.logger = DebugLogtron('tchannelTrace');
}

Agent.prototype.getInstance = function () {
    return this;
};

Agent.prototype.configure = function configure(options) {
    var self = this;

    Object.keys(options).forEach(function eachOptionKey(optionKey) {
        self[optionKey] = options[optionKey];
    });
};

function compareBufs(buf1, buf2) {
    if (!buf2) return false;
    return (buf1.readUInt32BE(0) === buf2.readUInt32BE(0)) &&
        (buf1.readUInt32BE(4) === buf2.readUInt32BE(4));
}

// ## setupNewSpan
// Sets up a new span for an outgoing rpc
Agent.prototype.setupNewSpan = function setupNewSpan(options) {
    var self = this;

    var hostPortParts = options.hostPort.split(":");
    var host = hostPortParts[0], port = parseInt(hostPortParts[1], 10);

    var empty = new Buffer([0, 0, 0, 0, 0, 0, 0, 0]);
    if (compareBufs(empty, options.parentid)) {
        options.parentid = null;
    }

    if (compareBufs(empty, options.traceid)) {
        options.traceid = null;
    }

    if (compareBufs(empty, options.spanid)) {
        options.spanid = null;
    }

    var span = new Span({
        logger: self.logger,
        endpoint: new Span.Endpoint(host, port, options.serviceName),
        name: options.name,
        id: options.spanid,
        parentid: options.parentid,
        traceid: options.traceid
    });

    var parentSpan = self.getCurrentSpan();
    if (parentSpan && (!options.parentid && !options.traceid)) {
        // If there's a parentSpan and the parentid and traceid weren't
        // specified, we need to propagate the ids from the parent span.
        span.propagateIdsFrom(parentSpan);
        span.generateSpanid();
    } else if (!parentSpan && (!options.traceid && !options.spanid)) {
        // No ids were specified and there's no parent span. Generate a new
        // id and use it as the spanid and traceid.
        span.generateIds();
    }

    return span;
};

Agent.prototype.destroy = function destroy() {
    var self = this;

    process.removeAsyncListener(self.asyncListener);
};

Agent.prototype.setCurrentSpan = function setCurrentSpan(span) {
    var self = this;

    self.currentSpan = span;
};

Agent.prototype.getCurrentSpan = function getCurrentSpan() {
    var self = this;

    return self.currentSpan;
};

Agent.prototype.report = function report(span) {
    var self = this;

    self.reporter(span);
};

// Default reporter, just logs.
Agent.prototype.reporter = function (span) {
    var self = this;

    // TODO: actual reporting
    self.logger.info('got span: ' + span.toString());
};
