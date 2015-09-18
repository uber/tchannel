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

function TChannelStatsd(channel, statsd) {
    if (!(this instanceof TChannelStatsd)) {
        return new TChannelStatsd(channel, statsd);
    }

    var self = this;

    self.statsd = statsd;
    self.channel = channel;
    self.channel.statEvent.on(onStat);

    function onStat(stat) {
        self.onStat(stat);
    }
}

function getKey(stat) {
    var prefix = stat.name;

    if (stat.tags.toStatKey) {
        return stat.tags.toStatKey(prefix);
    }

    return getSlowKey(stat, prefix);
}

function getSlowKey(stat, prefix) {
    /*eslint complexity: [2, 30]*/
    switch (prefix) {
        // outbound
        case 'tchannel.outbound.calls.system-errors':
        case 'tchannel.outbound.calls.operational-errors':
            return prefix + '.' +
                clean(stat.tags.service, 'no-service') + '.' +
                clean(stat.tags['target-service'], 'no-target-service') + '.' +
                clean(stat.tags['target-endpoint'], 'no-endpoint') + '.' +
                clean(stat.tags.type, 'no-type');

        case 'tchannel.outbound.calls.per-attempt.system-errors':
        case 'tchannel.outbound.calls.per-attempt.operational-errors':
            return prefix + '.' +
                clean(stat.tags.service, 'no-service') + '.' +
                clean(stat.tags['target-service'], 'no-target-service') + '.' +
                clean(stat.tags['target-endpoint'], 'no-endpoint') + '.' +
                clean(stat.tags.type, 'no-type') + '.' +
                stat.tags['retry-count'];

        case 'tchannel.outbound.calls.retries':
            return prefix + '.' +
                clean(stat.tags.service, 'no-service') + '.' +
                clean(stat.tags['target-service'], 'no-target-service') + '.' +
                clean(stat.tags['target-endpoint'], 'no-endpoint') + '.' +
                stat.tags['retry-count'];

        // inbound
        case 'tchannel.inbound.calls.system-errors':
            return prefix + '.' +
                clean(stat.tags['calling-service'], 'no-calling-service') + '.' +
                clean(stat.tags.service, 'no-service') + '.' +
                clean(stat.tags.endpoint, 'no-endpoint') + '.' +
                clean(stat.tags.type, 'no-type');

        case 'tchannel.inbound.protocol-errors':
        case 'tchannel.connections.active':
        case 'tchannel.connections.initiated':
        case 'tchannel.connections.connect-errors':
        case 'tchannel.connections.accepted':
            return prefix + '.' +
                cleanHostPort(stat.tags['peer-host-port'], 'no-peer-host-port');

        case 'tchannel.connections.accept-errors':
            return prefix + '.' +
                cleanHostPort(stat.tags['host-port'], 'no-host-port');

        case 'tchannel.connections.errors':
            return prefix + '.' +
                cleanHostPort(stat.tags['peer-host-port'], 'no-peer-host-port') + '.' +
                clean(stat.tags.type, 'no-type');

        case 'tchannel.connections.closed':
            return prefix + '.' +
                cleanHostPort(stat.tags['peer-host-port'], 'no-peer-host-port') + '.' +
                clean(stat.tags.reason, 'no-reason');

        case 'tchannel.relay.latency':
            return prefix;

        // other types
        default:
            return 'tchannel.bad-stat-object';
    }
}

TChannelStatsd.prototype.onStat = function onStat(stat) {
    var self = this;

    var key = getKey(stat);

    if (stat.type === 'counter') {
        return self.statsd.increment(key, stat.value);
    } else if (stat.type === 'gauge') {
        return self.statsd.gauge(key, stat.value);
    } else if (stat.type === 'timing') {
        return self.statsd.timing(key, stat.value);
    } else {
        self.channel.logger.error('Trying to emit an invalid stat object', {
            statType: stat.type,
            statName: stat.name
        });
    }
};

module.exports = TChannelStatsd;
