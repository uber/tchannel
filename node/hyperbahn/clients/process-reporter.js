'use strict';

var setInterval = require('timers').setInterval;
var clearInterval = require('timers').clearInterval;
var process = require('process');
var LagSampler = require('lag-sampler');

var DEFAULT_HANDLE_INTERVAL = 1000;
var DEFAULT_REQUEST_INTERVAL = 100;
var DEFAULT_MEMORY_INTERVAL = 1000;
var DEFAULT_LAG_SAMPLER_INTERVAL = 500;

module.exports = ProcessReporter;

function ProcessReporter(options) {
    if (!(this instanceof ProcessReporter)) {
        return new ProcessReporter(options);
    }

    var self = this;

    self.handleInterval =
        options.handleInterval || DEFAULT_HANDLE_INTERVAL;
    self.requestInterval =
        options.requestInterval || DEFAULT_REQUEST_INTERVAL;
    self.memoryInterval =
        options.memoryInterval || DEFAULT_MEMORY_INTERVAL;
    self.lagSamplerInterval =
        options.lagSamplerInterval || DEFAULT_LAG_SAMPLER_INTERVAL;

    self.statsd = options.statsd;

    self.handleTimer = null;
    self.requestTimer = null;
    self.memoryTimer = null;
    self.lagSampler = null;
}

ProcessReporter.prototype.bootstrap = function bootstrap() {
    var self = this;

    self.handleTimer = setInterval(onHandle, self.handleInterval);
    self.requestTimer = setInterval(onRequest, self.requestInterval);
    self.memoryTimer = setInterval(onMemory, self.memoryInterval);
    self.lagSampler = LagSampler(
        self.statsd, 'process-reporter.lag-sampler'
    );

    self.lagSampler.startPolling(self.lagSamplerInterval);

    function onHandle() {
        self._reportHandle();
    }
    function onRequest() {
        self._reportRequest();
    }
    function onMemory() {
        self._reportMemory();
    }
};

ProcessReporter.prototype.destroy = function destroy() {
    var self = this;

    clearInterval(self.handleTimer);
    clearInterval(self.requestTimer);
    clearInterval(self.memoryTimer);
};

ProcessReporter.prototype._reportHandle = function reportHandle() {
    var self = this;

    var count = process._getActiveHandles().length;
    self.statsd.timing('process-reporter.handles', count);
};

ProcessReporter.prototype._reportRequest = function reportRequest() {
    var self = this;

    var count = process._getActiveRequests().length;
    self.statsd.timing('process-reporter.requests', count);
};

ProcessReporter.prototype._reportMemory = function _reportMemory() {
    var self = this;

    var usage = process.memoryUsage();
    var prefix = 'process-reporter.memory-usage';

    self.statsd.gauge(prefix + '.rss', usage.rss);
    self.statsd.gauge(prefix + '.heap-used', usage.heapUsed);
    self.statsd.gauge(prefix + '.heap-total', usage.heapTotal);
};
