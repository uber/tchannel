'use strict';

var metrics = require('metrics');
var assert = require('assert');
var fs = require('fs');

main(process.argv);

function main(argv) {
    assert(argv[2], 'requires file argument');

    var file = argv[2];

    var contents = fs.readFileSync(file, 'utf8');
    var numbers = getNumbers(contents);

    var histo = new metrics.Histogram()
    for (var i = 0; i < numbers.length; i++) {
        histo.update(numbers[i]);
    }

    console.log(histo.printObj());
}

function getNumbers(contents) {
    var lines = contents.split('\n');

    var results = [];
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var numbers = line.split(' ');
        for (var j = 0; j < numbers.length; j++) {
            results.push(parseInt(numbers[j], 10));
        }
    }

    return results;
}
