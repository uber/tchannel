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

var tape = require('tape');
var tapeCluster = require('tape-cluster');

var allocCluster = require('./alloc-cluster.js');
var RelayNetwork = require('./relay_network.js');

HyperbahnCluster.test = tapeCluster(tape, HyperbahnCluster);

// TODO merge RelayNetwork into this
module.exports = HyperbahnCluster;

/*  This class is just to have the same interface as the
    hyperbahn cluster for sharing tests between tchannel
    and hyperbahn.

    options: {
        size: Number,
        namedRemotes: Array<String>
    }

    cluster: {
        remotes: {
            steve: HyperbahnRemote,
            bob: HyperbahnRemote
        },
        namedRemotes: Array<HyperbahnRemote>,
        logger: Logger,
        hostPortList: Array<String>,
        apps: Array<HyperbahnApps>
    }

    cluster.bootstrap(cb)

*/
function HyperbahnCluster(options) {
    if (!(this instanceof HyperbahnCluster)) {
        return new HyperbahnCluster(options);
    }

    var self = this;

    self.size = options.size || 2;
    self.namedRemotesConfig = options.namedRemotes || [];

    var serviceNames = [].concat(
        ['bob', 'steve', 'mary'],
        self.namedRemotesConfig
    );

    self.relayNetwork = RelayNetwork({
        numRelays: self.size,
        numInstancesPerService: 1,
        kValue: options.kValue || 5,
        serviceNames: serviceNames,
        clusterOptions: options.cluster || options.clusterOptions,
        timers: options.timers,
        servicePurgePeriod: options.servicePurgePeriod,
        exemptServices: readSeedConfig(options.remoteConfig, 'rateLimiting.exemptServices'),
        rpsLimitForServiceName: readSeedConfig(options.remoteConfig, 'rateLimiting.rpsLimitForServiceName'),
        totalRpsLimit: readSeedConfig(options.remoteConfig, 'rateLimiting.totalRpsLimit'),
        defaultServiceRpsLimit: readSeedConfig(options.remoteConfig, 'rateLimiting.defaultServiceRpsLimit'),
        rateLimiterBuckets: readSeedConfig(options.remoteConfig, 'rateLimiting.rateLimiterBuckets'),
        rateLimiterEnabled: readSeedConfig(options.remoteConfig, 'rateLimiting.enabled'),
    });

    self.remotes = {};
    self.namedRemotes = [];
    self.apps = null;
    self.logger = null;
    self.hostPortList = null;
    self.dummyCluster = null;
    self.dummies = null;
}

HyperbahnCluster.prototype.bootstrap = function bootstrap(cb) {
    var self = this;

    self.relayNetwork.bootstrap(onBootstrap);

    function onBootstrap(err) {
        if (err) {
            return cb(err);
        }

        var relayNetwork = self.relayNetwork;
        self.logger = self.relayNetwork.cluster.logger;

        self.hostPortList = relayNetwork.relayChannels.map(function p(c) {
            return c.hostPort;
        });
        self.apps = relayNetwork.relayChannels.map(function p(channel, index) {
            return HyperbahnApp({
                relayChannel: channel,
                serviceProxy: channel.handler,
                egressNodes: relayNetwork.egressNodesForRelay[index]
            });
        });

        self.remotes.steve = HyperbahnRemote({
            subChannel: relayNetwork.subChannelsByName.steve[0],
            hostPortList: self.hostPortList
        });
        self.remotes.bob = HyperbahnRemote({
            subChannel: relayNetwork.subChannelsByName.bob[0],
            hostPortList: self.hostPortList
        });

        for (var i = 0; i < self.namedRemotesConfig.length; i++) {
            var serviceName = self.namedRemotesConfig[i];

            self.namedRemotes[i] = HyperbahnRemote({
                subChannel: relayNetwork.subChannelsByName[serviceName][0],
                hostPortList: self.hostPortList
            });
        }

        allocCluster({
            numPeers: 2
        }).ready(onDummyCluster);
    }

    function onDummyCluster(cluster) {
        self.dummyCluster = cluster;
        self.dummies = cluster.channels;

        cb();
    }
};

HyperbahnCluster.prototype.checkExitPeers =
function checkExitPeers(assert, options) {
    // TODO implement
};

HyperbahnCluster.prototype.close = function close(cb) {
    var self = this;

    self.dummyCluster.destroy();
    self.relayNetwork.close(cb);
};

function HyperbahnApp(opts) {
    if (!(this instanceof HyperbahnApp)) {
        return new HyperbahnApp(opts);
    }

    var self = this;

    self._relayChannel = opts.relayChannel;
    self._egressNodes = opts.egressNodes;
    self.hostPort = opts.relayChannel.hostPort;
    self.clients = {
        tchannel: opts.relayChannel,
        serviceProxy: opts.serviceProxy
    };
}

HyperbahnApp.prototype.exitsFor = function exitsFor(serviceName) {
    var self = this;

    return self._egressNodes.exitsFor(serviceName);
};

HyperbahnApp.prototype.destroy = function destroy() {
    var self = this;

    self._relayChannel.close();
};

function HyperbahnRemote(opts) {
    if (!(this instanceof HyperbahnRemote)) {
        return new HyperbahnRemote(opts);
    }

    var self = this;

    self.serviceName = opts.subChannel.serviceName;
    self.channel = opts.subChannel.topChannel;
    self.clientChannel = self.channel.makeSubChannel({
        serviceName: 'hyperbahn-client',
        peers: opts.hostPortList,
        requestDefaults: {
            hasNoParent: true,
            headers: {
                as: 'raw',
                cn: self.serviceName
            }
        }
    });
    self.serverChannel = opts.subChannel;

    self.serverChannel.register('echo', echo);

    function echo(req, res, a, b) {
        res.headers.as = 'raw';
        res.sendOk(String(a), String(b));
    }
}

function readSeedConfig(config, key) {
    if (!config || !key) {
        return undefined;
    }

    return config[key];
}
