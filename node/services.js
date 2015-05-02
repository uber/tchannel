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

var errors = require('./errors');

function TChannelServices() {
    var self = this;
    // Maps service name with '$' prefix to service tracking object.
    // The prefix ensures that we cannot be lost or confused if some joker
    // names their service 'toString' or '__proto__'.
    // '_' as a prefix would still be confused by '_proto__', '__' would be
    // confused by 'proto__'.
    self.services = {};
    self.maxPendingForService = Infinity;
    self.maxPending = Infinity;
    self.pending = 0;
}

TChannelServices.prototype.errorIfExceedsMaxPending = function errorIfExceedsMaxPending(req) {
    var self = this;
    if (self.pending >= self.maxPending) {
        return errors.MaxPendingError({
            pending: self.pending
        });
    }
    if (!req.serviceName) {
        return;
    }
    var serviceKey = '$' + req.serviceName;
    var service = self.services[serviceKey];
    return service && service.errorIfExceedsMaxPending();
};

TChannelServices.prototype.onRequest = function onRequest(req) {
    var self = this;
    self.pending++;
    if (!req.serviceName) {
        return;
    }
    var serviceKey = '$' + req.serviceName;
    var service = self.services[serviceKey];
    if (!service) {
        service = new TChannelService();
        service.serviceName = req.serviceName;
        if (self.maxPendingForService !== undefined) {
            service.maxPending = self.maxPendingForService;
        }
        self.services[serviceKey] = service;
    }
    service.onRequest();
};

TChannelServices.prototype.onRequestResponse = function onRequestResponse(req) {
    var self = this;
    self.pending--;
    if (!req.serviceName) {
        return;
    }
    var serviceKey = '$' + req.serviceName;
    var service = self.services[serviceKey];
    service.onRequestResponse();
};

TChannelServices.prototype.onRequestError = function onRequestError(req) {
    var self = this;
    self.pending--;
    if (!req.serviceName) {
        return;
    }
    var serviceKey = '$' + req.serviceName;
    var service = self.services[serviceKey];
    service.onRequestError();
};

function TChannelService() {
    var self = this;
    self.serviceName = null;
    self.maxPending = Infinity;
    self.pending = 0;
}

TChannelService.prototype.errorIfExceedsMaxPending = function errorIfExceedsMaxPending() {
    var self = this;
    if (self.pending >= self.maxPending) {
        return errors.MaxPendingForServiceError({
            serviceName: self.serviceName,
            pending: self.pending
        });
    }
};

TChannelService.prototype.onRequest = function onRequest() {
    var self = this;
    self.pending += 1;
};

TChannelService.prototype.onRequestResponse = function onRequestResponse() {
    var self = this;
    self.pending -= 1;
};

TChannelService.prototype.onRequestError = function onRequestError() {
    var self = this;
    self.pending -= 1;
};

module.exports = TChannelServices;
