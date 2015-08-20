'use strict';

module.exports = home;

function home(opts, req, head, body, cb) {
    cb(null, {
        ok: true,
        head: null,
        body: 'hello from autobahn\n'
    });
}
