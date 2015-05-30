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

var StatEmitter = require('./stat_emitter');
var Counter = StatEmitter.Counter;
var Gauge = StatEmitter.Gauge;
var Timing = StatEmitter.Timing;

function TChannelStatsd(channel, statsd) {
    if (!(this instanceof TChannelStatsd)) {
        return new TChannelStatsd(channel, statsd);
    }

    var self = this;
    self.statsd = statsd;
    self.channel = channel;
    self.channel.on('stat', onStat);

    function onStat(stat) {
        self.onStat(stat);
    }
}

function getKey(common, stat) {
    // var host = common.host || 'host';
    // var cluster = common.cluster || 'cluster';
    var version = common.version || 'version';
    var service = stat.tags.service;
    var targetService = stat.tags['target-service'];

    // Note: endpoint should have a finite value space
    var endpoint = stat.tags['target-endpoint'] || 'endpoint';
    endpoint = endpoint.indexOf('::') !== -1 ?
        endpoint.split('::')[1] : endpoint;
    return [
        common.app,
        // host,
        // cluster,
        version,
        service,
        targetService,
        endpoint,
        stat.name
    ].join('.');
}

TChannelStatsd.prototype.onStat = function onStat(stat) {
    var self = this;
    var key = getKey(self.channel.statTags, stat);
    switch (stat.type) {
        case Counter.type:
            return self.statsd.increment(key);

        case Gauge.type:
            return self.statsd.gauge(key, stat.value);

        case Timing.type:
            return self.statsd.timing(key, stat.value);

        default:
            assert(false, stat.type + ' is not a stats type.');
            break;
    }
};

module.exports = TChannelStatsd;
