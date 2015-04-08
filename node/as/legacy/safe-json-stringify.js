'use strict';

module.exports = safeJSONStringify;

function safeJSONStringify(obj, cb) {
    var json;

    // jscs:disable
    try {
        json = JSON.stringify(obj);
    } catch (e) {
        return cb(e);
    }
    // jscs:enable

    return cb(null, json);
}
