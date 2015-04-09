'use strict';

var stringify = require('json-stringify-safe');

module.exports = safeErrorStringify;

function safeErrorStringify(err, cb) {
    var fields = {
        message: err.message,
        type: err.type
    };

    var keys = Object.keys(err);
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];

        fields[key] = err[key];
    }

    return cb(null, stringify(fields));
}
