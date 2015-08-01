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

'use strict';

var Cleaner = require('./statsd-clean');
var clean = Cleaner.clean;
var cleanHostPort = Cleaner.cleanHostPort;

module.exports = {
    BaseStat: BaseStat,
    InboundCallsRecvdTags: InboundCallsRecvdTags,
    OutboundCallsSuccessTags: OutboundCallsSuccessTags,
    OutboundCallsLatencyTags: OutboundCallsLatencyTags,
    OutboundCallsSentTags: OutboundCallsSentTags,
    OutboundCallsAppErrorsTags: OutboundCallsAppErrorsTags,
    OutboundCallsPerAttemptLatencyTags: OutboundCallsPerAttemptLatencyTags,
    OutboundCallsPerAttemptAppErrorsTags: OutboundCallsPerAttemptAppErrorsTags,
    InboundCallsLatencyTags: InboundCallsLatencyTags,
    InboundCallsSuccessTags: InboundCallsSuccessTags,
    InboundCallsAppErrorsTags: InboundCallsAppErrorsTags,
    InboundRequestSizeTags: InboundRequestSizeTags,
    ConnectionsBytesRcvdTags: ConnectionsBytesRcvdTags,
    InboundResponseSizeTags: InboundResponseSizeTags,
    OutboundRequestSizeTags: OutboundRequestSizeTags,
    ConnectionsBytesSentTags: ConnectionsBytesSentTags,
    OutboundResponseSizeTags: OutboundResponseSizeTags,
    RateLimiterServiceTags: RateLimiterServiceTags,
    RateLimiterEmptyTags: RateLimiterEmptyTags
};

function BaseStat(name, type, value, tags) {
    var self = this;

    self.name = name;
    self.type = type;
    self.value = value;
    self.tags = tags || {};
}

function InboundCallsRecvdTags(cn, serviceName, endpoint) {
    var self = this;

    self.app = null;
    self.host = null;
    self.cluster = null;
    self.version = null;

    self.callingService = cn || '';
    self.service = serviceName;
    self.endpoint = endpoint;
}

InboundCallsRecvdTags.prototype.toStatKey = function toStatKey(prefix) {
    var self = this;

    return prefix + '.' +
        clean(self.callingService, 'no-calling-service') + '.' +
        clean(self.service, 'no-service') + '.' +
        clean(self.endpoint, 'no-endpoint');
};

function OutboundCallsAppErrorsTags(serviceName, cn, endpoint, type) {
    var self = this;

    self.app = '';
    self.host = '';
    self.cluster = '';
    self.version = '';

    self.targetService = serviceName;
    self.service = cn;
    self.targetEndpoint = endpoint;
    self.type = type;
}

OutboundCallsAppErrorsTags.prototype.toStatKey = function toStatKey(prefix) {
    var self = this;

    return prefix + '.' +
        clean(self.service, 'no-service') + '.' +
        clean(self.targetService, 'no-target-service') + '.' +
        clean(self.targetEndpoint, 'no-endpoint') + '.' +
        clean(self.type, 'no-type');
};

function OutboundCallsSuccessTags(serviceName, cn, endpoint) {
    var self = this;

    self.app = '';
    self.host = '';
    self.cluster = '';
    self.version = '';

    self.targetService = serviceName;
    self.service = cn;
    self.targetEndpoint = endpoint;
}

OutboundCallsSuccessTags.prototype.toStatKey = function toStatKey(prefix) {
    var self = this;

    return prefix + '.' +
        clean(self.service, 'no-service') + '.' +
        clean(self.targetService, 'no-target-service') + '.' +
        clean(self.targetEndpoint, 'no-endpoint');
};

function OutboundCallsPerAttemptAppErrorsTags(
    serviceName, cn, endpoint, type, retryCount
) {
    var self = this;

    self.app = '';
    self.host = '';
    self.cluster = '';
    self.version = '';

    self.targetService = serviceName;
    self.service = cn;
    self.targetEndpoint = endpoint;
    self.type = type;
    self.retryCount = retryCount;
}

OutboundCallsPerAttemptAppErrorsTags.prototype.toStatKey =
function toStatKey(prefix) {
    var self = this;

    return prefix + '.' +
        clean(self.service, 'no-service') + '.' +
        clean(self.targetService, 'no-target-service') + '.' +
        clean(self.targetEndpoint, 'no-endpoint') + '.' +
        clean(self.type, 'no-type') + '.' +
        self.retryCount;
};

function OutboundCallsPerAttemptLatencyTags(
    serviceName, cn, endpoint, remoteAddr, retryCount
) {
    var self = this;

    self.app = '';
    self.host = '';
    self.cluster = '';
    self.version = '';

    self.targetService = serviceName;
    self.service = cn;
    self.targetEndpoint = endpoint;
    self.peer = remoteAddr;
    self.retryCount = retryCount;
}

OutboundCallsPerAttemptLatencyTags.prototype.toStatKey =
function toStatKey(prefix) {
    var self = this;

    return prefix + '.' +
        clean(self.service, 'no-service') + '.' +
        clean(self.targetService, 'no-target-service') + '.' +
        clean(self.targetEndpoint, 'no-endpoint') + '.' +
        self.retryCount;
};

function OutboundCallsLatencyTags(serviceName, cn, endpoint) {
    var self = this;

    self.app = '';
    self.host = '';
    self.cluster = '';
    self.version = '';

    self.targetService = serviceName;
    self.service = cn;
    self.targetEndpoint = endpoint;
}

OutboundCallsLatencyTags.prototype.toStatKey = function toStatKey(prefix) {
    var self = this;

    return prefix + '.' +
        clean(self.service, 'no-service') + '.' +
        clean(self.targetService, 'no-target-service') + '.' +
        clean(self.targetEndpoint, 'no-endpoint');
};

function OutboundCallsSentTags(serviceName, cn, endpoint) {
    var self = this;

    self.app = '';
    self.host = '';
    self.cluster = '';
    self.version = '';

    self.targetService = serviceName;
    self.service = cn;
    self.targetEndpoint = endpoint;
}

OutboundCallsSentTags.prototype.toStatKey = function toStatKey(prefix) {
    var self = this;

    return prefix + '.' +
        clean(self.service, 'no-service') + '.' +
        clean(self.targetService, 'no-target-service') + '.' +
        clean(self.targetEndpoint, 'no-endpoint');
};

function InboundCallsLatencyTags(cn, serviceName, endpoint) {
    var self = this;

    self.app = '';
    self.host = '';
    self.cluster = '';
    self.version = '';

    self.callingService = cn;
    self.service = serviceName;
    self.endpoint = endpoint;
}

InboundCallsLatencyTags.prototype.toStatKey = function toStatKey(prefix) {
    var self = this;

    return prefix + '.' +
        clean(self.callingService, 'no-calling-service') + '.' +
        clean(self.service, 'no-service') + '.' +
        clean(self.endpoint, 'no-endpoint');
};

function InboundCallsSuccessTags(cn, serviceName, endpoint) {
    var self = this;

    self.app = '';
    self.host = '';
    self.cluster = '';
    self.version = '';

    self.callingService = cn;
    self.service = serviceName;
    self.endpoint = endpoint;
}

InboundCallsSuccessTags.prototype.toStatKey = function toStatKey(prefix) {
    var self = this;

    return prefix + '.' +
        clean(self.callingService, 'no-calling-service') + '.' +
        clean(self.service, 'no-service') + '.' +
        clean(self.endpoint, 'no-endpoint');
};

function InboundCallsAppErrorsTags(cn, serviceName, endpoint, type) {
    var self = this;

    self.app = '';
    self.host = '';
    self.cluster = '';
    self.version = '';

    self.callingService = cn;
    self.service = serviceName;
    self.endpoint = endpoint;
    self.type = type;
}

InboundCallsAppErrorsTags.prototype.toStatKey = function toStatKey(prefix) {
    var self = this;

    return prefix + '.' +
        clean(self.callingService, 'no-calling-service') + '.' +
        clean(self.service, 'no-service') + '.' +
        clean(self.endpoint, 'no-endpoint') + '.' +
        clean(self.type, 'no-type');
};

function InboundRequestSizeTags(cn, serviceName, endpoint) {
    var self = this;

    self.app = null;
    self.host = null;
    self.cluster = null;
    self.version = null;

    self.callingService = cn;
    self.service = serviceName;
    self.endpoint = endpoint;
}

InboundRequestSizeTags.prototype.toStatKey = function toStatKey(prefix) {
    var self = this;

    return prefix + '.' +
        clean(self.callingService, 'no-calling-service') + '.' +
        clean(self.service, 'no-service') + '.' +
        clean(self.endpoint, 'no-endpoint');
};

function ConnectionsBytesRcvdTags(hostPort, peerHostPort) {
    var self = this;

    self.app = null;
    self.host = null;
    self.cluster = null;
    self.version = null;

    self.hostPort = hostPort;
    self.peerHostPort = peerHostPort;
}

ConnectionsBytesRcvdTags.prototype.toStatKey = function toStatKey(prefix) {
    var self = this;

    return prefix + '.' +
        cleanHostPort(self.peerHostPort, 'no-peer-host-port');
};

function InboundResponseSizeTags(cn, serviceName, endpoint) {
    var self = this;

    self.app = null;
    self.host = null;
    self.cluster = null;
    self.version = null;

    self.callingService = cn;
    self.service = serviceName;
    self.endpoint = endpoint;
}

InboundResponseSizeTags.prototype.toStatKey = function toStatKey(prefix) {
    var self = this;

    return prefix + '.' +
        clean(self.callingService, 'no-calling-service') + '.' +
        clean(self.service, 'no-service') + '.' +
        clean(self.endpoint, 'no-endpoint');
};

function OutboundRequestSizeTags(serviceName, cn, endpoint) {
    var self = this;

    self.app = null;
    self.host = null;
    self.cluster = null;
    self.version = null;

    self.targetService = serviceName;
    self.service = cn;
    self.targetEndpoint = endpoint;
}

OutboundRequestSizeTags.prototype.toStatKey = function toStatKey(prefix) {
    var self = this;

    return prefix + '.' +
        clean(self.service, 'no-service') + '.' +
        clean(self.targetService, 'no-target-service') + '.' +
        clean(self.targetEndpoint, 'no-endpoint');
};

function ConnectionsBytesSentTags(hostPort, peer) {
    var self = this;

    self.app = null;
    self.host = null;
    self.cluster = null;
    self.version = null;

    self.hostPort = hostPort;
    self.peerHostPort = peer;
}

ConnectionsBytesSentTags.prototype.toStatKey = function toStatKey(prefix) {
    var self = this;

    return prefix + '.' +
        cleanHostPort(self.peerHostPort, 'no-peer-host-port');
};

function OutboundResponseSizeTags(serviceName, cn, endpoint) {
    var self = this;

    self.app = null;
    self.host = null;
    self.cluster = null;
    self.version = null;

    self.targetService = serviceName;
    self.service = cn;
    self.targetEndpoint = endpoint;
}

OutboundResponseSizeTags.prototype.toStatKey = function toStatKey(prefix) {
    var self = this;

    return prefix + '.' +
        clean(self.service, 'no-service') + '.' +
        clean(self.targetService, 'no-target-service') + '.' +
        clean(self.targetEndpoint, 'no-endpoint');
};


function RateLimiterServiceTags(serviceName) {
    var self = this;

    self.app = null;
    self.host = null;
    self.cluster = null;
    self.version = null;

    self.targetService = serviceName;
}

RateLimiterServiceTags.prototype.toStatKey = function toStatKey(prefix) {
    var self = this;

    return prefix + '.' +
        clean(self.targetService, 'no-target-service');
};

function RateLimiterEmptyTags() {
    var self = this;

    self.app = null;
    self.host = null;
    self.cluster = null;
    self.version = null;
}

RateLimiterEmptyTags.prototype.toStatKey = function toStatKey(prefix) {
    return prefix;
};
