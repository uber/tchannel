'use strict';

module.exports = replPort;

function replPort(opts, req, head, body, cb) {
    var repl = opts.clients.repl;

    cb(null, {
        ok: true,
        head: null,
        body: repl.socketServer.address()
    });
}
