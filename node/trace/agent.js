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

    self.logger.info('tracing enabled');
}

// ## setupNewSpan
// Sets up a new span for an outgoing rpc
Agent.prototype.setupNewSpan = function setupNewSpan(options) {
    var self = this;


    var span = new Span({
        logger: self.logger,
        endpoint: self.endpoint,
        name: options.name,
        spanid: options.spanid
    });

    if (self.getCurrentSpan()) {
        // Fucking ugly
        var parentSpan = self.getCurrentSpan();
        parentSpan.ready(function () {
            // propagate parentid from current span
            console.log("setting parent.spanid", parentSpan.id);
            span.parentid = parentSpan.id;
            span.traceid = parentSpan.traceid;
        });
    }


    self.setCurrentSpan(span);

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
    });
};


