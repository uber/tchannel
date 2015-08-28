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

var extend = require('xtend');
var util = require('util');

var ResourcePool = require('./resource_pool');
var TestSearch = require('./test_search');
var TestIsolateSearch = require('./test_isolate_search');

/*
 * Minimal cluster object expected by this module:
 *
 *   cluster :: {
 *     client :: TChannel // top
 *     hosts :: [hostPort :: String]
 *     channels :: [chan :: TChannel]
 *     cleanup :: (assert, callback) -> void
 *   }
 *
 * cluster.client should be in cluster.channnels, it may be the only one.
 *
 * The cleanup function is called after each test to cleanup and/or assert that
 * the cluster is in an expected state.  If it does not error and if the assert
 * has no failures, then the cluster is reused for the next test.  In other
 * words, if the cleanup function can cause the cluster to not be reused in two
 * ways:
 * - call callback(err)
 * - call assert.fail() (directly or not)
 *
 * Options:
 * - setupCluster :: (cluster, callback) -> void
 *   - should setup any necessary local assets (e.g. test-specific handlers on
 *     any local channels)
 *   - should setup any test-necesasry peering on local channels
 * - setupClient :: (cluster, callback) -> void
 *   - should setup any necessary test client channels (sub channels of
 *     cluster.client); these channels should be made available as
 *     cluster.fooClient
 */

// TODO:
// - explicit Cluster prototype to share between inproc, remote, and others
// - concurrent mode
// - share channels mode (e.g. for concurrency)

function ClusterSearch(options) {
    if (!(this instanceof ClusterSearch)) {
        return new ClusterSearch(options);
    }
    var self = this;
    TestSearch.call(self, options);
    initClusterSearch(self);
}
util.inherits(ClusterSearch, TestSearch);

function ClusterIsolateSearch(options) {
    if (!(this instanceof ClusterIsolateSearch)) {
        return new ClusterIsolateSearch(options);
    }
    var self = this;
    TestIsolateSearch.call(self, options);
    initClusterSearch(self);
}
util.inherits(ClusterIsolateSearch, TestIsolateSearch);

function initClusterSearch(self) {
    self.clusterPool = new ResourcePool(setupCluster);
    if (self.options.createCluster) {
        self.createCluster = self.options.createCluster;
    } else if (self.options.host) {
        var clientOptions = extend(self.options.clientOptions, {
            host: self.options.host
        });
        self.createCluster = clusterClientCreator(clientOptions);
    } else {
        var inprocOptions = extend(self.options.inprocOptions);
        self.createCluster = inprocClusterCreator(inprocOptions);
    }

    if (!self.options.reuseChannels) self.on('done', onSearchTestDone);

    function setupCluster(callback) {
        self.setupCluster(callback);
    }

    function onSearchTestDone() {
        self.destroy();
    }
}

ClusterSearch.prototype.destroy =
ClusterIsolateSearch.prototype.destroy =
function destroy(callback) {
    var self = this;
    self.clusterPool.destroy(callback);
};

ClusterSearch.prototype.setupCluster =
ClusterIsolateSearch.prototype.setupCluster =
function setupCluster(callback) {
    var self = this;
    self.createCluster(created);

    function created(err, cluster) {
        if (err) {
            callback(err, cluster);
        } else if (self.options.setupCluster) {
            callProvidedSetup(cluster);
        } else {
            self.setupClient(cluster, callback);
        }
    }

    function callProvidedSetup(cluster) {
        self.options.setupCluster.call(self, cluster, setupDone);
        function setupDone(err) {
            if (err) {
                callback(err, cluster);
            } else {
                self.setupClient(cluster, callback);
            }
        }
    }
};

ClusterSearch.prototype.createCluster =
ClusterIsolateSearch.prototype.createCluster =
function createCluster(callback) {
    callback(new Error('not implemented'), null);
};

ClusterSearch.prototype.setupClient =
ClusterIsolateSearch.prototype.setupClient =
function setupClient(cluster, callback) {
    var self = this;

    if (cluster.hosts) {
        cluster.hosts.forEach(
            function each(host) {
            if (host !== cluster.client.hostPort) {
                cluster.client.peers.add(host);
            }
        });
    }

    if (self.options.setupClient) {
        self.options.setupClient.call(self, cluster, finish);
    } else {
        finish(null);
    }

    // TODO: could pre-connect
    // var peers = client.peers.values();
    // peers.forEach(function each(peer) {
    //     var conn = peer.connectTo();
    //     if (conn.remoteName) {
    //         ready.signal();
    //     } else {
    //         conn.on('identified', ready.signal);
    //     }
    // });
    // ready(clientReady);
    // function clientReady() {
    //     callback(null, client);
    // }

    function finish(err) {
        callback(err, cluster);
    }
};

ClusterSearch.prototype.test =
ClusterIsolateSearch.prototype.test =
function test(state, assert) {
    var self = this;
    self.clusterPool.get(gotCluster);

    function gotCluster(err, cluster) {
        if (err) {
            finish(err, cluster);
        } else {
            self.options.clusterTest.call(self, cluster, state, assert, testDone);
        }

        function testDone(err) {
            cleanup(err, cluster);
        }
    }

    function cleanup(err, cluster) {
        if (err) {
            finish(err, cluster);
        } else {
            cluster.cleanup(assert, cleanupDone);
        }
        function cleanupDone(err) {
            finish(err, cluster);
        }
    }

    function finish(err, cluster) {
        assert.ifError(err, self.describeState(state) + ': no final error');
        if (!assert._ok) {
            cluster.destroy(assert.end);
        } else {
            self.clusterPool.release(cluster);
            assert.end();
        }
    }
};

function inprocClusterCreator(options) {
    var allocCluster = require('./alloc-cluster.js');

    // TODO: create explicit client, stop re-using a "peer" for it?

    if (!options) options = {};
    if (!options.numPeers) options.numPeers = 2;
    if (!options.cleanState) {
        options.cleanState = {
            channels: [{
                peers: [{
                    connections: [
                        {direction: 'in', inReqs: 0, outReqs: 0}
                    ]
                }]
            }, {
                peers: [{
                    connections: [
                        {direction: 'out', inReqs: 0, outReqs: 0}
                    ]
                }]
            }]
        };
    }

    return createInprocCluster;

    function createInprocCluster(created) {
        var cluster = allocCluster(options);
        cluster.client = cluster.channels[1];
        cluster.cleanup = cleanupInprocCluster;
        if (options.init) {
            options.init(cluster, function initDone(err) {
                if (err) {
                    created(err, cluster);
                } else {
                    cluster.ready(inprocClusterReady);
                }
            });
        } else {
            cluster.ready(inprocClusterReady);
        }

        function cleanupInprocCluster(assert, cleanupDone) {
            if (options.cleanState) {
                cluster.assertCleanState(assert, options.cleanState);
            }
            cleanupDone(null);
        }

        function inprocClusterReady() {
            created(null, cluster);
        }
    }
}

function clusterClientCreator(options) {
    var TChannel = require('../../channel');
    var format = require('util').format;

    if (!options) options = {};
    if (options.host) options.hosts = [options.host];
    if (!options.hosts) throw new Error('no host(s) specified');

    return createClusterClient;

    function createClusterClient(callback) {
        var cluster = {
            hosts: options.hosts,
            channels: [],
            destroy: destroyClusterClient,
            cleanup: cleanupClusterClient
        };
        cluster.client = TChannel(extend(options.clientOptions));
        cluster.channels.push(cluster.client);

        if (options.clientListen) {
            cluster.client.on('listening', onListening);
            cluster.client.listen(options.clientListen.port,
                                  options.clientListen.host);
        } else {
            callback(null, cluster);
        }

        // TODO: could re-use assertion logic with allocCluster, allowing user
        // to specify expected clean client state
        function cleanupClusterClient(assert, callback) {
            var peers = cluster.client.peers.values();
            peers.forEach(function eachPeer(peer, i) {
                peer.connections.forEach(function eachConn(conn, j) {
                    var pending = conn.ops.getPending();

                    assert.equal(pending.in, 0, format(
                        'client peer[%s] conn[%s] should have no inReqs', i, j));
                    assert.equal(pending.out, 0, format(
                        'client peer[%s] conn[%s] should have no outReqs', i, j));
                });
            });
            callback(null);
        }

        function destroyClusterClient(callback) {
            cluster.client.close(callback);
        }

        function onListening() {
            callback(null, cluster);
        }
    }
}

// TODO: leftover from predecessor code, may be useful
// function closeClusterConnections(cluster, callback) {
//     var toClose = cluster.channels.length;
//     var errs = [];
//     cluster.channels.forEach(function each(channel) {
//         channel.peers.close(peersClosed);
//     });
//     function peersClosed(err) {
//         if (err) errs.push(err);
//         if (--toClose <= 0) callback(errs.length && errs[errs.length - 1]);
//     }
// }

module.exports.ClusterSearch = ClusterSearch;
module.exports.ClusterIsolateSearch = ClusterIsolateSearch;
module.exports.inprocClusterCreator = inprocClusterCreator;
module.exports.clusterClientCreator = clusterClientCreator;
