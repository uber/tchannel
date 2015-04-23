function TChannelOptions(defaults, options) {
    var self = this;

    self.logger = null;
    self.random = null;
    self.timers = null;

    self.timeout = options && options.timeout || defaults.timeout;
    self.service = options && options.service || defaults.service;
    self.serviceName = options && options.serviceName || defaults.serviceName;
    self.host = options && options.host || defaults.host;
    self.trace = options && options.trace || defaults.trace;
    self.retryLimit = options && options.retryLimit || defaults.retryLimit;
    self.headers = options && options.headers || defaults.headers;
    self.streamed = options && options.streamed || defaults.streamed;
    self.retryFlags = options && options.retryFlags || defaults.retryFlags;
    self.shouldApplicationRetry = options && options.shouldApplicationRetry || defaults.shouldApplicationRetry;
    self.checksumType = options && options.checksumType || defaults.checksumType;
    self.checksum = options && options.checksum || defaults.checksum;
    self.remoteAddr = options && options.remoteAddr || defaults.remoteAddr;
    self.ttl = options && options.ttl || defaults.ttl;
    self.tracer = options && options.tracer || defaults.tracer;
    self.sendFrame = options && options.sendFrame || defaults.sendFrame;

    self.parentSpan = options && options.parentSpan || defaults.parentSpan;
    self.topLevelRequest = options && options.topLevelRequest || defaults.topLevelRequest;

}

module.exports = TChannelOptions;
