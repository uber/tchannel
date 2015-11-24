'use strict';

/* Semantics:

    Takes frames in; Mutates the id; forwards.

    Accepting one TCP socket in; Hardcoded to send to a relays

    This program is bounded by a single TCP socket

    node naive-relay.js [port] [host] [hps]
*/

var assert = require('assert');

var NaiveRelay = require('../naive-relay/relay.js');

if (require.main === module) {
    var args = process.argv.slice(2);
    process.title = 'nodejs-benchmarks-naive_relay';
    main(args);
}

function main(argv) {
    assert(argv[0], '--port required');
    assert(argv[1], '--host required');
    assert(argv[2], '--relays required');

    var relay = NaiveRelay({
        relays: argv[2]
    });
    relay.listen(argv[0], argv[1]);

    relay.printRPS();
}
