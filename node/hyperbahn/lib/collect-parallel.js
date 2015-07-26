'use strict';

var Result = require('bufrw/result');

module.exports = collectParallel;

function collectParallel(tasks, iteratee, callback) {
    var keys = Object.keys(tasks);
    var results = Array.isArray(tasks) ? [] : {};
    var context = new ParallelContext(
        results, keys.length, callback
    );

    if (context.counter === 0) {
        callback(null, context.results);
        return;
    }

    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var value = tasks[key];

        iteratee(value, key, insertResult(context, key));
    }
}

function insertResult(context, resultKey) {
    return callback;

    function callback(err, result) {
        context.results[resultKey] = new Result(err, result);

        if (--context.counter === 0) {
            return context.callback(null, context.results);
        }
    }
}

function ParallelContext(results, counter, callback) {
    this.results = results;
    this.counter = counter;
    this.callback = callback;
}
