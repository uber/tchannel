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
}

// ## setupNewSpan
// Sets up a new span for an outgoing rpc
Agent.prototype.setupNewSpan = function setupNewSpan(options) {
    var self = this;

    var parentid, traceid;
    if (self.getCurrentSpan()) {
        // propagate parentid from current span
        parentid = self.currentspan.id;
        traceid = self.currentspan.traceid;
    } else {
        // root, so parent of 0
        parentid = new Buffer(8);
        parentid.fill(0);
    }


    var span = new Span({
        logger: self.logger,
        endpoint: self.endpoint,
        name: options.name,
        traceid: traceid,            // span will generate if unspecified
        spanid: options.spanid,
        parentid: parentid
    });

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

    self.logger.info('got span', span);
};


