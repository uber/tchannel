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

var debugLogtron = require('debug-logtron');
var RelayNetwork = require('./lib/relay_network.js');
var States = require('../states');
var MockTimers = require('time-mock');

RelayNetwork.test('circuits: how do they work', {
    timers: new MockTimers(0),
    clusterOptions: {
        logger: debugLogtron('tchannel', {enabled: false}),
        peerOptions: {
            // Pin down the peer states
            initialState: States.LockedHealthyState
        }
    },
    serviceNames: ['alice', 'bob'],
    numInstancesPerService: 1,
    numRelays: 1,
    kValue: 1,
    circuitsConfig: {
        enabled: true,
        period: 500
    }
}, function t(network, assert) {
    var period = 500;
    var requestsLimit = 1000;
    var fastDelay = 200;
    var slowDelay = 2000;
    var delay = fastDelay;

    var downPeriods = 4;
    var backoffPeriods = 10;
    var upPeriods = 40;
    var trigger = 23;

    var done = false;
    var requestNum = 0;
    var events = new EventLog(network.timers, period);

    network.register('call', delegator(hugeBodyHandler));
    sendRequest();

    function each() {
        // waitForBroke
        if (!events.byDesc.broke) {
            if (events.byDesc['res:good'].length > trigger) {
                network.endpoints.call.delegate = negligentHandler;
                events.log('broke');
            }
            return;
        }

        // waitForDecline
        if (!events.byDesc.backoff) {
            if (events.byDesc['err:tchannel.declined'] && delay !== slowDelay) {
                events.log('backoff');
                delay = slowDelay;
            }
            return;
        }

        // waitForDownPeriod
        if (!events.byDesc.restored) {
            if (events.periodsSince(EventLog.LAST, 'downPeriod') !== 0) {
                events.log('downPeriod');
            }
            if (events.byDesc.downPeriod.length >= downPeriods) {
                events.log('restored');
                network.endpoints.call.delegate = hugeBodyHandler;
            }
            return;
        }


        // waitForBackoffPeriod
        if (!events.byDesc.notch) {
            if (events.periodsSince(EventLog.LAST, 'upPeriod') !== 0) {
                events.log('upPeriod');
            }

            if (events.byDesc.upPeriod.length >= backoffPeriods &&
                delay !== fastDelay) {
                events.log('notch');
                delay = fastDelay;
            }
            return;
        }

        // waitForUpPeriod
        if (events.byDesc.upPeriod.length < upPeriods) {
            events.log('upPeriod');
            return;
        }

        // reset
        events.log('reset');
        proc(events.take());
        done = true;
    }

    function sendRequest() {
        var req = network.send({
            callerName: 'alice',
            serviceName: 'bob'
        }, 'call', 'HUGE HEAD', 'tiny body', function done(err, res, arg2, arg3) {
            onResponse(req, err, res, arg2, arg3);
        });
    }

    function onResponse(req, err, res) {
        // update the event log
        events.updateTime();
        if (err) {
            events.log('err:' + err.type);
        } else {
            events.log('res:' + (res.ok ? 'good' : 'bad'));
        }

        each(req, err, res);

        if (!done && requestNum++ < requestsLimit) {
            network.timers.advance(delay);
            sendRequest();
        } else {
            finish();
        }
    }

    var inspect = require('util').inspect;

    function proc(log) {
        if (!log.length) return;

        console.log('\n\n', inspect(
            log,
            {depth: null}));

        // console.log('\n\n', inspect(
        //     groupPeriods(log).map(function each(g) {
        //         return {
        //             elapsed: g.end - g.start,
        //             log: g.log.map(function each(ent) {return ent.desc;})
        //         };
        //     }),
        //     {depth: null}));

    }

    function finish(err) {
        if (err) {
            assert.end(err);
            return;
        }

        proc(events.take());

        assert.end();
    }
});

function delegator(delegate) {
    handler.delegate = delegate;
    return handler;

    function handler(req, res) {
        handler.delegate(req, res);
    }
}

function negligentHandler(req, res) {
    res.sendError('UnexpectedError', 'it wasn\'t me');
}

function hugeBodyHandler(req, res) {
    res.headers.as = 'raw';
    res.sendOk('tiny head', 'HUGE BODY');
}

function groupPeriods(log) {
    var grouped = [];
    var cur = null;

    for (var i = 0; i < log.length; i++) {
        if (!cur || cur.period !== log[i].period) {
            startNew(i);
        } else {
            cur.end = log[i].time;
            cur.log.push(log[i]);
        }
    }

    return grouped;

    function startNew(i) {
        grouped.push(cur = {
            period: log[i].period,
            start: log[i].time,
            end: log[i].time,
            log: [log[i]]
        });
    }
}

EventLog.FIRST = 0;
EventLog.LAST = -1;

function EventLog(timers, periodLength) {
    var self = this;

    self.timers = timers;
    self.periodLength = periodLength;
    self.periodNum = 1;
    self.now = self.timers.now();
    self.start = self.now;

    self.entries = [];
    self.byDesc = {};
}

EventLog.prototype.hasElapsedSince = function hasElapsedSince(index, desc, numPeriods) {
    var self = this;

    return self.periodsSince(index, desc) >= numPeriods - 1;
};

EventLog.prototype.periodsSince = function since(index, desc) {
    var self = this;

    var byDesc = self.byDesc[desc];
    if (!byDesc) {
        return -1;
    }

    var ent;
    if (index < 0) {
        ent = byDesc[byDesc.length + index];
    } else {
        ent = byDesc[index];
    }
    if (!ent) {
        return -1;
    }

    return self.periodNum - ent.period;
};

EventLog.prototype.updateTime = function updateTime() {
    var self = this;

    var now = self.timers.now();
    if (self.now !== now) {
        self.now = now;
        self.periodNum = 1 + Math.floor((self.now - self.start) / self.periodLength);
    }
};

EventLog.prototype.take = function take() {
    var self = this;

    var ret = self.entries;
    self.clear();
    return ret;
};

EventLog.prototype.clear = function clear() {
    var self = this;

    self.entries = [];
    self.byDesc = {};
};

EventLog.prototype.log = function log(desc, extra) {
    var self = this;

    var ent = {
        time: self.timers.now(),
        period: self.periodNum,
        desc: desc
    };

    self.entries.push(ent);
    if (!self.byDesc[desc]) {
        self.byDesc[desc] = [ent];
    } else {
        self.byDesc[desc].push(ent);
    }

    return ent;
};
