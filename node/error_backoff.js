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

var assert = require('assert');
var errors = require('./errors');

function getEdgeName(cn, serviceName) {
    return cn + '~~' + serviceName;
}

function ErrorBackoff(options) {
    if (!(this instanceof ErrorBackoff)) {
        return new ErrorBackoff(options);
    }
    var self = this;

    self.channel = options.channel;
    self.enabled = !!options.enabled;
    assert(self.channel && !self.channel.topChannel, 'ErrorBackoff requires top channel');
    self.backoffRate = options.backoffRate || 0;
    assert(self.backoffRate >= 0, 'ErrorBackoff requires a nonnegative backoffRate');
    self.reqErrors = Object.create(null);
    self.recoverRate = 1;
    if (options.recoverRate && options.recoverRate > 1) {
        self.recoverRate = options.recoverRate;
    }

    self.logger = self.channel.logger;
}

ErrorBackoff.prototype.type = 'tchannel.error-backoff';

ErrorBackoff.prototype.handleError =
function handleError(err, cn, serviceName) {
    var self = this;
    if (!self.enabled || !self.backoffRate) {
        return;
    }

    assert(err && cn && serviceName, 'ErrorBackoff.handleError called with invalid parameters');

    if (!self.shouldConsider(err)) {
        return;
    }

    var edge = getEdgeName(cn, serviceName);
    if (!self.reqErrors[edge]) {
        self.reqErrors[edge] = self.backoffRate;
    } else {
        self.reqErrors[edge] += self.backoffRate;
    }
};

ErrorBackoff.prototype.enable =
function enable() {
    var self = this;
    self.enabled = true;
};

ErrorBackoff.prototype.disable =
function disable() {
    var self = this;
    self.enabled = false;
    self.reqErrors = Object.create(null);
};

ErrorBackoff.prototype.shouldConsider =
function shouldConsider(err) {
    return errors.isUnhealthy(errors.classify(err));
};

ErrorBackoff.prototype.shouldBackoff =
function shouldBackoff(cn, serviceName) {
    var self = this;
    if (!self.enabled || !self.backoffRate) {
        return false;
    }

    assert(cn && serviceName, 'ErrorBackoff.shouldBackoff called with invalid parameters');

    var edge = getEdgeName(cn, serviceName);
    if (!self.reqErrors[edge] || self.reqErrors[edge] < 1) {
        return false;
    }

    self.reqErrors[edge] -= self.recoverRate;
    return true;
};

module.exports = ErrorBackoff;
