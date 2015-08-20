'use strict';

module.exports = dumpHeap;

function dumpHeap(opts, req, head, body, cb) {
    var heapFile = opts.clients.heapDumper.writeSnapshot();

    cb(null, {
        ok: true,
        head: null,
        body: {
            path: heapFile
        }
    });
}
