'use strict';

var getPeerInfo = require('./peer-info.js');

module.exports = ExitNode;

function ExitNode(clients) {
    if (!(this instanceof ExitNode)) {
        return new ExitNode(clients);
    }
    var self = this;
    self.tchannel = clients.tchannel;
}

ExitNode.prototype.getServiceConnections =
function getServiceConnections(serviceName) {
    var self = this;
    var svcchan = self.tchannel.handler.getServiceChannel(serviceName);
    var connectedHostPorts = {};
    if (svcchan) {
        svcchan.peers.entries().forEach(function each(ent) {
            var hostPort = ent[0];
            var peer = ent[1];
            connectedHostPorts[hostPort] = getPeerInfo(peer);
        });
    }
    return connectedHostPorts;
};
