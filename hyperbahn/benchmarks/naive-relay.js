'use strict';

/* Semantics:

    Takes frames in; Mutates the id; forwards.

    Accepting one TCP socket in; Hardcoded to send to a relays

    This program is bounded by a single TCP socket

    node naive-relay.js --relays [hps] --port [num]
*/

var parseArgs = require('minimist');
var assert = require('assert');
var process = require('process');
var myLocalIp = require('my-local-ip');

var NaiveRelay = require('../naive-relay/relay.js');

if (require.main === module) {
    var args = parseArgs(process.argv.slice(2));
    process.title = 'nodejs-benchmarks-naive_relay';
    main(args);
}

function main(argv) {
    assert(argv.relays, '--relays required');
    assert(argv.port, '--port required');

    var relay = NaiveRelay({
        relays: argv.relays
    });
    relay.listen(argv.port, argv.host || myLocalIp());
}
