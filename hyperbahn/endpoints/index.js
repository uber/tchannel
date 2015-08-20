'use strict';

module.exports = setupEndpoints;

function setupEndpoints(clients, services) {
    var opts = {
        clients: clients,
        services: services
    };

    var endpoints = [
        // Utility
        ['health_v1', require('./health')],
        ['hosts_v1', require('./hosts')],
        ['repl_port_v1', require('./repl-port')],
        ['heap_dump_v1', require('./heap-dump')],

        ['connections_v1', require('./entry_connections')],
        ['exit_connections_v1', require('./exit_connections')],
        ['channels_v1', require('./channels')],
        ['circuits_v1', require('./circuits')],

        ['kill_switch_v1', require('./kill-switch')],
        ['rate_limiter_query_v1', require('./rate-limiter').queryHandler],
        ['rate_limiter_exempt_v1', require('./rate-limiter').exemptHandler],
        ['rate_limiter_limit_v1', require('./rate-limiter').limitHandler],
        ['rate_limiter_enable_v1', require('./rate-limiter').enableHandler],
        ['rate_limiter_total_limit_v1', require('./rate-limiter').totalLimitHandler],

        // Public entry interface
        ['set_k_v1', require('./entry_set_k')],

        // Internal exit interface
        ['exit_set_k_v1', require('./exit_set_k')]
    ];

    endpoints.forEach(function each(pair) {
        var name = pair[0];
        var handle = pair[1];

        clients.tchannelJSON.register(
            clients.autobahnChannel, name, opts, handle
        );

        // TODO
        // function(req, res, arg2, arg3) {
        //     // XXX check ready, return error frame if not
        //     handle(req, res, arg2, arg3);
        // }
    });
}
