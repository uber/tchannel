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

var CountedReadySignal = require('ready-signal/counted');
var EventEmitter = require('events').EventEmitter;
var tape = require('tape');
var deepExtend = require('deep-extend');
var shallowExtend = require('xtend');
var getPort = require('get-port');
var parallel = require('run-parallel');
var TChannel = require('tchannel');
var DebugLogtron = require('debug-logtron');
var inherits = require('util').inherits;
var nodeAssert = require('assert');
var TChannelJSON = require('tchannel/as/json');
var tapeCluster = require('tape-cluster');

var TCReporter = require('tchannel/tcollector/reporter');
var FakeTCollector = require('./fake-tcollector');
var TestApplication = require('./test-app.js');
var RemoteConfigFile = require('./remote-config-file.js');

TestCluster.test = tapeCluster(tape, TestCluster);

module.exports = TestCluster;

function TestCluster(opts) {
    if (!(this instanceof TestCluster)) {
        return new TestCluster(opts);
    }

    var self = this;
    EventEmitter.call(self);

    self.opts = opts || {};
    self.size = self.opts.size || 2;
    self.dummySize = self.opts.dummySize || 2;
    self.namedRemotesConfig = self.opts.namedRemotes || [];

    var defaultKValue = self.size <= 20 ?
        Math.floor(self.size / 2) : 10;

    if (defaultKValue < 1) {
        defaultKValue = 1;
    }

    self.kValue = typeof opts.kValue === 'number' ?
        opts.kValue : defaultKValue;

    opts.remoteConfig = opts.remoteConfig || {};
    opts.remoteConfig['kValue.default'] =
        opts.remoteConfig['kValue.default'] || self.kValue;

    // These are a ring of Hyperbahn apps
    self.apps = [];
    // These are empty TChannel instances, which are not used for new tests
    // since we have remotes.
    self.dummies = [];
    // The hostPorts for each member of the ring.
    self.hostPortList = [];
    self.ringpopHosts = [];
    // Bob and Steve
    self.remotes = {};
    // Names of additional remotes (from opts.namedRemotes)
    self.namedRemotes = [];

    self.timers = null; // Set whenever a channel is created

    self.tchannelJSON = TChannelJSON();
    self.logger = DebugLogtron('autobahn');
}
inherits(TestCluster, EventEmitter);

TestCluster.prototype.bootstrap = function bootstrap(cb) {
    var self = this;

    var ready = CountedReadySignal(self.size + self.dummySize);

    ready(onReady);

    // bob and steve

    var i = 0;
    for (i = 0; i < self.size; i++) {
        self.apps[i] = self.createApplication('127.0.0.1:0', ready.signal);
    }
    for (i = 0; i < self.dummySize; i++) {
        self.dummies[i] = self.createDummy(ready.signal);
    }

    function onReady() {
        var ringpopBootstrapped = CountedReadySignal(self.size);
        var i;

        ringpopBootstrapped(onRingpopBootstrapped);

        for (i = 0; i < self.apps.length; i++) {
            self.hostPortList[i] = self.apps[i].hostPort;
        }

        self.ringpopHosts = self.hostPortList;

        for (i = 0; i < self.apps.length; i++) {
            self.apps[i].clients.autobahnHostPortList = self.hostPortList;
            self.apps[i].clients.setupRingpop(ringpopBootstrapped.signal);
        }
    }

    function onRingpopBootstrapped() {
        self.waitForRingpop(onConvergence);
    }

    function onConvergence() {
        self.remotes.tcollector = self.createRemote({
            serviceName: 'tcollector',
            trace: false
        }, onTCollectorReady);
    }

    function onTCollectorReady() {
        self.tcollector = FakeTCollector({
            channel: self.remotes.tcollector.serverChannel
        });

        var ready = CountedReadySignal(
            2 + self.namedRemotesConfig.length
        );

        ready(onRemotes);

        self.remotes.bob = self.createRemote({
            serviceName: 'bob',
            trace: self.opts.trace,
            traceSample: 1
        }, ready.signal);
        self.remotes.steve = self.createRemote({
            serviceName: 'steve',
            trace: self.opts.trace,
            traceSample: 1
        }, ready.signal);

        for (var i = 0; i < self.namedRemotesConfig.length; i++) {
            self.namedRemotes[i] = self.createRemote({
                serviceName: self.namedRemotesConfig[i],
                trace: self.opts.trace,
                traceSample: 1
            }, ready.signal);
        }
    }

    function onRemotes() {
        self.emit('listening');
        cb();
    }
};

TestCluster.prototype.createRemote = function createRemote(opts, cb) {
    var self = this;
    var channel = TChannel({
        logger: self.logger,
        trace: opts.trace,
        traceSample: opts.traceSample
    });
    self.timers = channel.timers;
    channel.on('listening', onListen);
    channel.listen(0, '127.0.0.1');

    if (opts.trace) {
        var tcreporter = TCReporter({
            callerName: 'tcollector-' + opts.serviceName,
            logger: self.logger,
            channel: channel.makeSubChannel({
                peers: self.hostPortList,
                serviceName: 'tcollector-client'
            })
        });
        channel.tracer.reporter = function reporter(span) {
            tcreporter.report(span);
        };
    }

    var remote = {
        clientChannel: channel.makeSubChannel({
            serviceName: 'autobahn-client',
            peers: self.hostPortList,
            requestDefaults: {
                hasNoParent: true,
                headers: {
                    as: 'raw',
                    cn: opts.serviceName
                }
            }
        }),
        serverChannel: channel.makeSubChannel({
            serviceName: opts.serviceName
        }),
        channel: channel,
        serviceName: opts.serviceName,
        hostPort: null,
        destroy: destroy
    };
    remote.serverChannel.register('echo', echo);

    return remote;

    function onListen() {
        remote.hostPort = channel.hostPort;

        self.sendRegister(channel, {
            serviceName: opts.serviceName
        }, onRegister);
    }

    function destroy() {
        if (!channel.destroyed) {
            channel.close();
        }
    }

    function onRegister(err) {
        if (err) {
            return self.emit('error', err);
        }

        cb();
    }

    function echo(req, res, a, b) {
        res.headers.as = 'raw';
        res.sendOk(String(a), String(b));
    }
};

TestCluster.prototype.waitForRingpop = function waitForRingpop(cb) {
    var self = this;

    if (self.isRingpopConverged()) {
        return cb();
    }

    var ringpops = self.apps.map(function getRing(x) {
        return x.clients.ringpop;
    });
    ringpops.map(function addListener(ringpop) {
        ringpop.ring.on('checksumComputed', checkAgain);
    });

    function checkAgain() {
        if (!self.isRingpopConverged()) {
            return null;
        }

        ringpops.forEach(function remove(ringpop) {
            ringpop.removeListener('checksumComputed', checkAgain);
        });
        cb();
    }
};

TestCluster.prototype.isRingpopConverged = function isRingpopConverged() {
    var self = this;

    var ringpops = self.apps.map(function getRing(x) {
        return x.clients.ringpop;
    });

    var allHosts = ringpops.map(function getHosts(r) {
        return Object.keys(r.ring.servers);
    });

    var converged = allHosts.every(function checkHosts(ringHosts) {
        // Must be same length
        if (ringHosts.length !== self.hostPortList.length) {
            return false;
        }

        ringHosts.sort();
        self.hostPortList.sort();

        return ringHosts.every(function checkItem(hostPort, i) {
            return self.hostPortList[i] === hostPort;
        });
    });

    return converged;
};

TestCluster.prototype.close = function close(cb) {
    var self = this;
    var i = 0;
    for (i = 0; i < self.apps.length; i++) {
        self.apps[i].destroy();
        if (self.apps[i].remoteConfigFile) {
            self.apps[i].remoteConfigFile.clear();
        }
    }
    for (i = 0; i < self.dummies.length; i++) {
        var dummy = self.dummies[i];
        if (!dummy.destroyed) {
            dummy.close();
        }
    }

    self.remotes.steve.destroy();
    self.remotes.bob.destroy();
    self.remotes.tcollector.destroy();

    for (i = 0; i < self.namedRemotes.length; i++) {
        self.namedRemotes[i].destroy();
    }

    cb();
};

TestCluster.prototype.createApplication =
function createApplication(hostPort, cb) {
    var self = this;
    var parts = hostPort.split(':');
    var host = parts[0];
    var port = Number(parts[1]);

    var localOpts = shallowExtend(self.opts);
    localOpts.seedConfig = deepExtend(localOpts.seedConfig || {}, {
        'tchannel.host': host,
        'hyperbahn.ringpop.bootstrapFile': self.ringpopHosts
    });
    localOpts.argv = {
        port: port
    };

    // var remoteConfigPath = path.join(__dirname, '../hyperbahn-remote-config.json');
    var rateLimiterBuckets;
    var remoteConfigFile;
    if (self.opts.remoteConfig) {
        remoteConfigFile = RemoteConfigFile(hostPort);
        remoteConfigFile.write(self.opts.remoteConfig);
        localOpts.seedConfig = deepExtend(localOpts.seedConfig, {
            'clients.remote-config.file': remoteConfigFile.filePath
        });
        rateLimiterBuckets = self.opts.remoteConfig['rateLimiting.rateLimiterBuckets'];
    }

    localOpts.clients = localOpts.clients || {};
    localOpts.clients.logger =
        localOpts.clients.logger || self.logger;
    localOpts.rateLimiterBuckets = rateLimiterBuckets;

    // TODO throw an error if listen() fails
    // TODO add timeout to gaurd against this edge case
    var app = TestApplication(localOpts);
    app.remoteConfigFile = remoteConfigFile;
    app.partialBootstrap(cb);
    return app;
};

TestCluster.prototype.createDummy = function createDummy(cb) {
    var self = this;
    var dummy = TChannel({
        logger: self.logger,
        traceSample: 1
    });
    dummy.on('listening', cb);
    dummy.listen(0, '127.0.0.1');
    return dummy;
};

TestCluster.prototype.checkExitKValue = function checkExitKValue(assert, opts) {
    nodeAssert(opts && opts.serviceName, 'serviceName required');
    nodeAssert(opts && opts.kValue, 'kValue required');

    var self = this;

    var app = self.apps[0];
    var exitShard = app.clients.egressNodes
        .exitsFor(opts.serviceName);

    var shardKeys = Object.keys(exitShard)
        .reduce(function concatBuilder(acc, key) {
            return acc.concat(exitShard[key]);
        }, []);

    assert.equal(shardKeys.length, opts.kValue,
        'exitNode has kValue number of keys');

    self.apps.forEach(function checkApp(localApp) {
        var localExitShard = localApp.clients.egressNodes
            .exitsFor(opts.serviceName);
        assert.deepEqual(
            localExitShard,
            exitShard,
            'cluster application has same shards as everyone else'
        );
    });
};

TestCluster.prototype.checkExitPeers =
function checkExitPeers(assert, opts) {
    nodeAssert(opts && opts.serviceName, 'serviceName required');
    nodeAssert(opts && opts.hostPort, 'hostPort required');

    var self = this;
    var app = self.apps[0];

    var exitShard = app.clients.egressNodes
        .exitsFor(opts.serviceName);

    var exitApps = self.apps.filter(function isExit(someApp) {
        return !!exitShard[someApp.tchannel.hostPort];
    });

    if (opts.blackList) {
        exitApps = exitApps.filter(function isNotBlackListed(someApp) {
            return opts.blackList.indexOf(someApp.hostPort) === -1;
        });
    }

    exitApps.forEach(function checkApp(exitApp) {
        exitApp.checkExitPeers(assert, opts);
    });
};

TestCluster.prototype.getExitNodes = function getExitNodes(serviceName) {
    var self = this;

    var app = self.apps[0];
    var ringpop = app.clients.ringpop;
    var hosts = [];

    for (var i = 0; i < self.kValue; i++) {
        var hp = ringpop.lookup(serviceName + '~' + i);
        if (hosts.indexOf(hp) === -1) {
            hosts.push(hp);
        }
    }

    var exitApps = [];
    for (var j = 0; j < self.apps.length; j++) {
        if (hosts.indexOf(self.apps[j].hostPort) > -1) {
            exitApps.push(self.apps[j]);
        }
    }

    return exitApps;
};

TestCluster.prototype.sendRegister =
function sendRegister(channel, opts, cb) {
    var self = this;

    nodeAssert(opts.serviceName, 'need a serviceName to register');

    var hyperChan;
    if (channel.subChannels.hyperbahn) {
        hyperChan = channel.subChannels.hyperbahn;
    } else if (!channel.subChannels.hyperbahn) {
        hyperChan = channel.makeSubChannel({
            serviceName: 'hyperbahn',
            peers: self.hostPortList
        });
    }

    if (opts.host) {
        channel.waitForIdentified({
            host: opts.host
        }, send);
    } else {
        send();
    }

    function send(err) {
        if (err) {
            return cb(err);
        }

        self.tchannelJSON.send(hyperChan.request({
            serviceName: 'hyperbahn',
            host: opts.host,
            hasNoParent: true,
            trace: false,
            timeout: 5000,
            headers: {
                'cn': opts.serviceName
            }
        }), 'ad', null, {
            services: [{
                cost: 0,
                serviceName: opts.serviceName
            }]
        }, cb);
    }
};
