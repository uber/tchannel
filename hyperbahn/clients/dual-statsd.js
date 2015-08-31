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

var os = require('os');
var process = require('process');
var Statsd = require('uber-statsd-client');
var assert = require('assert');

module.exports = DualStatsd;

function DualStatsd(options) {
    /*eslint no-process-env: 0 */
    if (!(this instanceof DualStatsd)) {
        return new DualStatsd(options);
    }

    var self = this;

    assert(options.host, 'options.host required');
    assert(options.port, 'options.port required');
    assert(options.project, 'options.project required');
    assert(options.processTitle, 'options.processTitle required');

    self.perServerClient = new Statsd({
        host: options.host,
        port: options.port,
        prefix: [
            options.project,
            process.env.NODE_ENV,
            os.hostname().split('.')[0]
        ].join('.'),
        packetQueue: options.packetQueue || null,
        socketTimeout: options.socketTimeout || null
    });
    self.perWorkerClient = new Statsd({
        host: options.host,
        port: options.port,
        prefix: [
            options.project,
            'per-worker',
            process.env.NODE_ENV,
            os.hostname().split('.')[0],
            options.processTitle
        ].join('.'),
        packetQueue: options.packetQueue || null,
        socketTimeout: options.socketTimeout || null
    });
}

DualStatsd.prototype.gauge = function gauge(name, value) {
    var self = this;

    self.perServerClient.gauge(name, value);
    self.perWorkerClient.gauge(name, value);
};

DualStatsd.prototype.counter = function counter(name, delta) {
    var self = this;

    self.perServerClient.counter(name, delta);
    self.perWorkerClient.counter(name, delta);
};

DualStatsd.prototype.increment = function increment(name, delta) {
    var self = this;

    self.perServerClient.increment(name, delta);
    self.perWorkerClient.increment(name, delta);
};

DualStatsd.prototype.decrement = function decrement(name, delta) {
    var self = this;

    self.perServerClient.decrement(name, delta);
    self.perWorkerClient.decrement(name, delta);
};

DualStatsd.prototype.timing = function timing(name, time) {
    var self = this;

    self.perServerClient.timing(name, time);
    self.perWorkerClient.timing(name, time);
};

DualStatsd.prototype.immediateGauge =
function immediateGauge(name, value, cb) {
    var self = this;

    self.perServerClient.immediateGauge(name, value, cb);
    self.perWorkerClient.immediateGauge(name, value, noop);
};

DualStatsd.prototype.immediateCounter =
function immediateCounter(name, delta, cb) {
    var self = this;

    self.perServerClient.immediateCounter(name, delta, cb);
    self.perWorkerClient.immediateCounter(name, delta, noop);
};

DualStatsd.prototype.immediateIncrement =
function immediateIncrement(name, delta, cb) {
    var self = this;

    self.perServerClient.immediateIncrement(name, delta, cb);
    self.perWorkerClient.immediateIncrement(name, delta, noop);
};

DualStatsd.prototype.immediateDecrement =
function immediateDecrement(name, delta, cb) {
    var self = this;

    self.perServerClient.immediateDecrement(name, delta, cb);
    self.perWorkerClient.immediateDecrement(name, delta, noop);
};

DualStatsd.prototype.immediateTiming =
function immediateTiming(name, time, cb) {
    var self = this;

    self.perServerClient.immediateTiming(name, time, cb);
    self.perWorkerClient.immediateTiming(name, time, noop);
};

DualStatsd.prototype.close = function close() {
    var self = this;

    self.perServerClient.close();
    self.perWorkerClient.close();
};

function noop() {}
