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
