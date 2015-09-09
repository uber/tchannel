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

var TChannelAsThrift = require('tchannel/as/thrift.js');

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

    /*eslint no-unused-vars: 0*/
    // thrift health endpoint
    var tchannelAsThrift = new TChannelAsThrift({
        source: '// lul',
        channel: clients.hyperbahnChannel,
        isHealthy: require('./health').isHealthy
    });
}
