// Copyright (c) 2015 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

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
