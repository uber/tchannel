'use strict';

var TypedError = require('error/typed');

var collectParallel = require('./lib/collect-parallel.js');

/* Idea

== Support unique serviceNames

If we force setting a `gitRepository` in the registration
we can have the exit nodes tell use whether there is a conflict.

This means the entry node can check all exit nodes results
for whether there are any conflicts and if there are, broadcast
unregister and fail the register

== Support "provides" / "aliases"

There was mention about wanting to say that your serviceName
is either `paxon` or `uber.surge.query`. A more common thing
might be either `logtron` or `utilities.logging`.

Allowing services to have aliases means they can say what
implementation they provide rather then saying what unique
snowflake name they have as a service.

Supporting aliases would basically require a secondary index
on the ringpop membership group. We would need to implement
a secondary index for ringpop and have a way to replicate the
secondary index information between all entry nodes

*/

// # EntryNodeCouldNotFindExitNodesError
var EntryNodeCouldNotFindExitNodesError = TypedError({
    type: 'autobahn.entry-node.could-not-find-exit-nodes',
    message: 'Autobahn: Entry node could not find any exit nodes!',
    nameAsThrift: 'couldNotFindExitNodes'
});

module.exports = EntryNode;

function EntryNode(clients) {
    if (!(this instanceof EntryNode)) {
        return new EntryNode(clients);
    }
    var self = this;
    // Store the clients internally. The external user
    // should not touch the clients directly, only methods.
    self._clients = clients;
    self.serviceProxy = clients.serviceProxy;
    self.egressNodes = clients.egressNodes;
}

EntryNode.prototype.getHostsConnectionsForService =
function getHostsConnectionsForService(opts, cb) {
    var self = this;

    var exitNodes = self.egressNodes.exitsFor(opts.serviceName);
    var hosts = Object.keys(exitNodes);

    if (hosts.length === 0) {
        return cb(EntryNodeCouldNotFindExitNodesError());
    }

    collectParallel(hosts, requestExitConnection, onAllCollected);

    function requestExitConnection(host, key, callback) {
        var autobahnChannel = self._clients.autobahnChannel;
        var tchannelJSON = self._clients.tchannelJSON;

        autobahnChannel.waitForIdentified({
            host: host
        }, onIdentified);

        function onIdentified(err) {
            if (err) {
                return callback(err);
            }

            tchannelJSON.send(autobahnChannel.request({
                host: host,
                timeout: 5000,
                serviceName: 'autobahn',
                parent: opts.inreq,
                headers: {
                    cn: 'autobahn'
                }
            }), 'exit_connections_v1', null, {
                serviceName: opts.serviceName
            }, callback);
        }
    }

    function onAllCollected(err, collection) {
        /* istanbul ignore if */
        if (err) {
            // collectParallel never passes errors forward.
            self._clients.logger.error(
                'unexpected service-connections collection error',
                {
                    error: err,
                    serviceName: opts.serviceName
                }
            );
            return cb(err);
        }

        var results = {};
        collection.forEach(function buildResult(nodeResult, index) {
            var nodeHost = hosts[index];

            if (nodeResult.err) {
                results[nodeHost] = {
                    err: nodeResult.err
                };
            } else {
                var res = nodeResult.value;
                if (res.ok) {
                    results[nodeHost] = {
                        instances: nodeResult.value.body
                    };
                } else {
                    results[nodeHost] = {
                        err: nodeResult.value.body
                    };
                }
            }
        });

        cb(null, results);

    }
};

EntryNode.prototype.isExitNodeFor = function isExitNodeFor(service) {
    var self = this;
    var exitNodes = self.egressNodes.exitsFor(service);
    var whoami = self._clients.ringpop.whoami();
    return exitNodes[whoami] !== undefined;
};

EntryNode.prototype.setK = function setK(serviceName, k) {
    var self = this;
    self._clients.logger.info('k set', {
        serviceName: serviceName,
        k: k
    });
    self.egressNodes.setKValueFor(serviceName, k);
};

EntryNode.prototype.fanoutSetK = function fanoutSetK(opts, cb) {
    var self = this;
    var ringpop = self._clients.ringpop;

    collectParallel(ringpop.membership.members, exitSetK, onAllSet);

    function exitSetK(member, key, callback) {
        var autobahnChannel = self._clients.autobahnChannel;
        var tchannelJSON = self._clients.tchannelJSON;

        autobahnChannel.waitForIdentified({
            host: member.address
        }, onIdentified);

        function onIdentified(err) {
            if (err) {
                return callback(err);
            }

            tchannelJSON.send(autobahnChannel.request({
                host: member.address,
                parent: opts.inreq,
                timeout: 2000,
                serviceName: 'autobahn',
                headers: {
                    cn: 'autobahn'
                }
            }), 'exit_set_k_v1', null, {
                serviceName: opts.serviceName,
                k: opts.k
            }, callback);
        }
    }

    function onAllSet(err, collection) {
        if (err) {
            self._clients.logger.error('unexpected k fanout error', {
                error: err,
                serviceName: opts.serviceName,
                k: opts.k
            });
            return cb(err);
        }

        var results = {};
        collection.forEach(function buildResult(setKResult, index) {
            if (setKResult.err) {
                var member = ringpop.membership.members[index];
                results[member.address] = setKResult.err;
            }
        });

        cb(null, results);
    }
};
