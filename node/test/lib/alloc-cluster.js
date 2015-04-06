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
var CountedReadySignal = require('ready-signal/counted');
var test = require('tape');
var util = require('util');
var TChannel = require('../../index.js');
var parallel = require('run-parallel');
var debugLogtron = require('debug-logtron');
var LEVELS = require('debug-logtron/levels');

module.exports = allocCluster;

function allocCluster(opts) {
    opts = opts || {};

    var host = 'localhost';
    var logger = debugLogtron('tchannel');

    // TODO: debugLogtron should do this by default imo
    var orig = logger._log;
    logger._log = function _log(level, msg, meta, cb) {
        if (level >= LEVELS.warn) {
            var mess = msg;
            if (meta && meta.error) {
                mess += ' - ' + meta.error.message;
            }
            var levelName = LEVELS.LEVELS_BY_VALUE[level];
            console.error('%s: %s ~', levelName, mess, meta);
        }
        orig.call(logger, level, msg, meta, cb);
    };

    var cluster = {
        logger: logger,
        hosts: new Array(opts.numPeers),
        channels: new Array(opts.numPeers),
        destroy: destroy,
        ready: CountedReadySignal(opts.numPeers),
        assertCleanState: assertCleanState
    };
    var channelOptions = extend({
        logger: logger
    }, opts.channelOptions || opts);

    for (var i = 0; i < opts.numPeers; i++) {
        createChannel(i);
    }

    return cluster;

    function assertCleanState(assert, expected) {
        cluster.channels.forEach(function eachChannel(chan, i) {
            var chanExpect = expected.channels[i];
            if (!chanExpect) {
                assert.fail(util.format('unexpected channel[%s]', i));
                return;
            }

            var peers = chan.peers.values();
            assert.equal(peers.length, chanExpect.peers.length, util.format(
                'channel[%s] should have %s peer(s)', i, chanExpect.peers.length));
            peers.forEach(function eachPeer(peer, j) {
                var peerExpect = chanExpect.peers[j];
                if (!peerExpect) {
                    assert.fail(util.format(
                        'unexpected channel[%s] peer[%s]', i, j));
                    return;
                }
                peer.connections.forEach(function eachConn(conn, k) {
                    var connExpect = peerExpect.connections[k];
                    if (!connExpect) {
                        assert.fail(util.format(
                            'unexpected channel[%s] peer[%s] conn[%s]', i, j, k));
                        return;
                    }
                    Object.keys(connExpect).forEach(function eachProp(prop) {
                        var desc = util.format(
                            'channel[%s] peer[%s] conn[%s] should .%s',
                            i, j, k, prop);
                        switch (prop) {
                        case 'inOps':
                        case 'outOps':
                            assert.equal(Object.keys(conn[prop]).length, connExpect[prop], desc);
                            break;
                        default:
                            assert.equal(conn[prop], connExpect[prop], desc);
                        }
                    });
                });
            });
        });
    }

    function createChannel(i) {
        var chan = TChannel(extend(channelOptions));
        var port = opts.listen && opts.listen[i] || 0;
        chan.listen(port, host);
        cluster.channels[i] = chan;
        chan.once('listening', chanReady);

        function chanReady() {
            var port = chan.address().port;
            cluster.hosts[i] = util.format('%s:%s', host, port);
            cluster.ready.signal(cluster);
        }
    }

    function destroy(cb) {
        parallel(cluster.channels.map(function(chan) {
            return function(done) {
                if (!chan.destroyed) chan.quit(done);
            };
        }), cb);
    }
}

allocCluster.test = function testCluster(desc, opts, t) {
    if (typeof opts === 'number') {
        opts = {
            numPeers: opts
        };
    }
    if (typeof opts === 'function') {
        t = opts;
        opts = {};
    }
    test(desc, function t2(assert) {
        allocCluster(opts).ready(function clusterReady(cluster) {
            assert.once('end', function testEnded() {
                cluster.destroy();
            });
            t(cluster, assert);
        });
    });
};
