'use strict';

var heapdump = require('heapdump');
var mkdirp = require('mkdirp');
var path = require('path');
var process = require('process');

module.exports = HeapDumper;

function HeapDumper(options) {
    if (!(this instanceof HeapDumper)) {
        return new HeapDumper(options);
    }

    var self = this;

    self.heapFolder = options.heapFolder;
    self.logger = options.logger;
}

HeapDumper.prototype.writeSnapshot = function writeSnapshot() {
    var self = this;

    var heapFile = path.join(self.heapFolder, [
        process.title,
        '.',
        process.pid,
        '.',
        Date.now(),
        '.heapsnapshot'
    ].join(''));

    self.logger.warn('write a heapsnapshot', {
        file: heapFile
    });

    // NEVER DO SYNC.
    // Exception because heapsnapshot is also sync
    mkdirp.sync(self.heapFolder);
    heapdump.writeSnapshot(heapFile);

    return heapFile;
};
