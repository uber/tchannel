'use strict';

var os = require('os');
var process = require('process');
var Statsd = require('uber-statsd-client');
var NullStatsd = require('uber-statsd-client/null');

module.exports = createStatsd;

function createStatsd(opts) {
    /*eslint no-process-env: 0 */
    return opts && opts.host && opts.port ? new Statsd({
        host: opts.host,
        port: opts.port,
        prefix: [
            opts.project,
            process.env.NODE_ENV,
            os.hostname().split('.')[0]
        ].join('.'),
        packetQueue: opts.packetQueue || null,
        socketTimeout: opts.socketTimeout || null
    }) : NullStatsd();
}
