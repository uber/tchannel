'use strict';

/* Semantics:

    Takes frames in; Mutates the id; forwards.

    Accepting one TCP socket in; Hardcoded to send to a destination

    This program is bounded by a single TCP socket

    node naive-relay.js --destination [num] --port [num]
*/

var parseArgs = require('minimist');
var assert = require('assert');
var process = require('process');

var NaiveRelay = require('../naive-relay/relay.js');

if (require.main === module) {
    var argv = parseArgs(process.argv.slice(2));
    process.title = 'nodejs-benchmarks-naive_relay';
    main(argv);
}

function main(argv) {
    assert(argv.destination, '--destination required');
    assert(argv.port, '--port required');

    var relay = NaiveRelay({
        destination: argv.destination
    });
    relay.listen(argv.port);
}
