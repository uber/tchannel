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

    self.endpoint =
        new Span.Endpoint(options.host, options.port, options.serviceName);
    self.logger = options.logger || NullLogtron();

    self.reporter = options.reporter || null;

    self.logger.info('tracing enabled');
}

// ## setupNewSpan
// Sets up a new span for an outgoing rpc
Agent.prototype.setupNewSpan = function setupNewSpan(options, cb) {
    var self = this;

    var traceid;
    if (self.getCurrentSpan()) {
        traceid = true;
    }

    if (options.traceid) {
        traceid = options.traceid;
    }

    var span = new Span({
        logger: self.logger,
        endpoint: self.endpoint,
        name: options.name,
        id: options.spanid,
        parentid: options.parentid,
        // If there is a current span we don't want this new intance to
        // generate his own traceid.
        traceid: traceid
    });

    // TODO: fix callback mess
    if (self.getCurrentSpan() && (!options.parentid && !options.traceid)) {
        // Fucking ugly
        var parentSpan = self.getCurrentSpan();
        parentSpan.ready(function () {
            // propagate parentid from current span

            span.parentid = parentSpan.id;
            span.traceid = parentSpan.traceid;

            if (cb) process.nextTick(cb);
        });
    } else {
        if (cb) process.nextTick(cb);
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


