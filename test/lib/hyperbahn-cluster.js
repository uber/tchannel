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

var RelayNetwork = require('./relay_network.js');

HyperbahnCluster.test = tapeCluster(tape, HyperbahnCluster);

// TODO merge RelayNetwork into this
module.exports = HyperbahnCluster;

/*  This class is just to have the same interface as the
    hyperbahn cluster for sharing tests between tchannel
    and hyperbahn.

    cluster: {
        remotes: {
            steve: TChannel,
            bob: TChannel
        },
        logger: Logger,
        hostPortList: Array<String>
    }

*/
function HyperbahnCluster(options) {
    if (!(this instanceof HyperbahnCluster)) {
        return new HyperbahnCluster(options);
    }

    var self = this;

    self.size = options.size;

    self.relayNetwork = RelayNetwork({
        numRelays: self.size,
        numInstancesPerService: self.size,
        kValue: 5,
        serviceNames: ['bob', 'steve', 'mary'],
        cluster: options.cluster
    });

    self.remotes = {};
    self.logger = null;
    self.hostPortList = null;
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

        self.remotes.steve = HyperbahnRemote({
            subChannel: relayNetwork.subChannelsByName.steve[0]
        });
        self.remotes.bob = HyperbahnRemote({
            subChannel: relayNetwork.subChannelsByName.bob[0]
        });
        self.hostPortList = relayNetwork.relayChannels.map(function p(c) {
            return c.hostPort;
        });

        cb();
    }
};

HyperbahnCluster.prototype.checkExitPeers =
function checkExitPeers(assert, options) {
    // TODO implement
};

HyperbahnCluster.prototype.close = function close(cb) {
    var self = this;

    self.relayNetwork.close(cb);
};

function HyperbahnRemote(opts) {
    if (!(this instanceof HyperbahnRemote)) {
        return new HyperbahnRemote(opts);
    }

    var self = this;

    self.serviceName = opts.subChannel.serviceName;
    self.channel = opts.subChannel.topChannel;
    self.clientChannel = opts.subChannel;
}
