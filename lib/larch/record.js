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

var stringify = require('json-stringify-safe');

module.exports = Record;

function Record(level, message, meta, time) {
    this.meta = (meta === null || meta === undefined) ? null : meta;
    this.data = new RecordData(level, message, time);
    this.serialized = null;
    this.hasBeenMerged = false;
}

Record.prototype.serialize = function serialize() {
    if (this.serialized !== null) {
        this.serialized = stringify(this.toJSON());
    }

    return this.serialized;
};

Record.prototype.toJSON = function toJSON() {
    var i;
    if (!this.hasBeenMerged) {
        for (i in this.meta) if (this.meta.hasOwnProperty(i)) {
            this.data[i] = this.meta[i];
        }

        this.hasBeenMerged = true;
    }

    return this.data;
};

function RecordData(level, message, time) {
    this.level = level;
    this.message = message;
    this.time = time || new Date().toISOString();
}
