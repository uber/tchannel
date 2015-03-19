var process = require('process');
if (!process.addAsyncListener) {
    require('async-listener');
}

var NullLogtron = require('null-logtron');

var Span = require('./span');

module.exports = Agent;

function Agent (options) {
    if (!(this instanceof Agent)) {
        return new Agent(options);
    }
    var self = this;

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

    // TODO: options validation

    self.logger = options.logger || NullLogtron();

    self.reporter = options.reporter || null;

    self.logger.info('tracing enabled');
}

// ## setupNewSpan
// Sets up a new span for an outgoing rpc
Agent.prototype.setupNewSpan = function setupNewSpan(options) {
    var self = this;

    var traceid;
    if (self.getCurrentSpan()) {
        traceid = true;
    }

    if (options.traceid) {
        traceid = options.traceid;
    }

    var hostPortParts = options.hostPort.split(":");
    var host = hostPortParts[0], port = parseInt(hostPortParts[1], 10);

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

Agent.prototype.setCurrentSpan = function setCurrentTracing(tracing) {
    var self = this;

    self.currentSpan = tracing;
};

Agent.prototype.getCurrentSpan = function getCurrentTracing() {
    var self = this;

    return self.currentSpan;
};

Agent.prototype.report = function report(span) {
    var self = this;

    // TODO: actual reporting

    span.ready(function spanReady() {
        self.logger.info('got span: ' + span.toString());
        if (typeof self.reporter === 'function') {
            self.reporter(span);
        }
    });
};


