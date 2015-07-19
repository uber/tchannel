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
    OutboundResponseSizeTags: OutboundResponseSizeTags
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

function ConnectionsBytesRcvdTags(hostPort, peerHostPort) {
    var self = this;

    self.app = null;
    self.host = null;
    self.cluster = null;
    self.version = null;

    self.hostPort = hostPort;
    self.peerHostPort = peerHostPort;
}

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

function ConnectionsBytesSentTags(hostPort, peer) {
    var self = this;

    self.app = null;
    self.host = null;
    self.cluster = null;
    self.version = null;

    self.hostPort = hostPort;
    self.peerHostPort = peer;
}

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
