'use strict';

module.exports = getPeerInfo;

function getPeerInfo(peer) {
    return {
        connected: {
            in: peer.isConnected('in', false),
            out: peer.isConnected('out', false)
        },
        identified: {
            in: peer.isConnected('in', true),
            out: peer.isConnected('out', true)
        },
        serviceNames: Object.keys(peer.serviceProxyServices || {})
    };
}
