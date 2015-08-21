'use strict';

module.exports = channelsEndpoint;

function channelsEndpoint(opts, req, head, body, cb) {
    var tchannel = opts.clients.tchannel;

    var channels = {};
    Object.keys(tchannel.subChannels)
    .forEach(function eachService(serviceName) {
        var channel = tchannel.subChannels[serviceName];
        channels[serviceName] = {
            serviceName: serviceName,
            handlerType: channel.handler.type,
            mode: channel.options && channel.options.autobahnMode
        };
    });

    cb(null, {
        ok: true,
        head: null,
        body: channels
    });
}
