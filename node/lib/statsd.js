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

function clean(str) {
    return str
        .replace(/:/g, '-')
        .replace(/\./g, '-')
        .replace(/{|}/g, '-');
}

function getKey(common, stat) {
    var prefix = ['tchannel', stat.name].join('.');
    switch (stat.name) {
        // outbound
        case 'outbound.calls.sent':
            return [
                prefix,
                clean(stat.tags.service),
                clean(stat.tags['target-service']),
                clean(stat.tags['target-endpoint'])
            ].join('.');
        case 'outbound.calls.success':
            return [
                prefix,
                clean(stat.tags.service),
                clean(stat.tags['target-service']),
                clean(stat.tags['target-endpoint'])
            ].join('.');
        case 'outbound.calls.system-errors':
            return [
                prefix,
                clean(stat.tags.service),
                clean(stat.tags['target-service']),
                clean(stat.tags['target-endpoint']),
                clean(stat.tags.type)
            ].join('.');
        case 'outbound.calls.operational-errors':
            return [
                prefix,
                clean(stat.tags.service),
                clean(stat.tags['target-service']),
                clean(stat.tags['target-endpoint']),
                clean(stat.tags.type)
            ].join('.');
        case 'outbound.calls.app-errors':
            return [
                prefix,
                clean(stat.tags.service),
                clean(stat.tags['target-service']),
                clean(stat.tags['target-endpoint']),
                clean(stat.tags.type)
            ].join('.');
        case 'outbound.calls.retries':
            return [
                prefix,
                clean(stat.tags.service),
                clean(stat.tags['target-service']),
                clean(stat.tags['target-endpoint']),
                stat.tags['retry-count']
            ].join('.');
        case 'outbound.calls.latency':
            return [
                prefix,
                clean(stat.tags.service),
                clean(stat.tags['target-service']),
                clean(stat.tags['target-endpoint'])
            ].join('.');
        case 'outbound.calls.per-attempt-latency':
            return [
                prefix,
                clean(stat.tags.service),
                clean(stat.tags['target-service']),
                clean(stat.tags['target-endpoint']),
                clean(stat.tags.peer),
                stat.tags['retry-count']
            ].join('.');

        // inbound
        case 'inbound.calls.recvd':
            return [
                prefix,
                clean(stat.tags['calling-service']),
                clean(stat.tags.service),
                clean(stat.tags.endpoint)
            ].join('.');
        case 'inbound.calls.success':
            return [
                prefix,
                clean(stat.tags['calling-service']),
                clean(stat.tags.service),
                clean(stat.tags.endpoint)
            ].join('.');
        case 'inbound.calls.system-errors':
            return [
                prefix,
                clean(stat.tags['calling-service']),
                clean(stat.tags.service),
                clean(stat.tags.endpoint),
                clean(stat.tags.type)
            ].join('.');
        case 'inbound.calls.app-errors':
            return [
                prefix,
                clean(stat.tags['calling-service']),
                clean(stat.tags.service),
                clean(stat.tags.endpoint),
                clean(stat.tags.type)
            ].join('.');
        case 'inbound.calls.latency':
            return [
                prefix,
                clean(stat.tags['calling-service']),
                clean(stat.tags.service),
                clean(stat.tags.endpoint)
            ].join('.');
        default:
        return '';
    }
}

TChannelStatsd.prototype.onStat = function onStat(stat) {
    var self = this;
    var key = getKey(self.channel.statTags, stat);
    switch (stat.type) {
        case 'counter':
            return self.statsd.increment(key, stat.value);

        case 'gauge':
            return self.statsd.gauge(key, stat.value);

        case 'timing':
            return self.statsd.timing(key, stat.value);

        default:
            assert(false, stat.type + ' is not a stats type.');
            break;
    }
};

module.exports = TChannelStatsd;
