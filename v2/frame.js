// Copyright (c) 2015 Uber Technologies, Inc.

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

var TypedError = require('error/typed');
var read = require('../lib/read');
var write = require('../lib/write');

var ExtraFrameDataError = TypedError({
    type: 'tchannel.extra-frame-data',
    message: 'got {trailing} bytes of extra frame data beyond body',
    length: null,
    trailing: null
});

var FieldTooLargeError = TypedError({
    type: 'tchannel.field-too-large',
    message: '{field} too large at {length} bytes, cannot exceed {max} bytes',
    field: null,
    length: null,
    max: null
});

var InvalidFrameTypeError = TypedError({
    type: 'tchannel.invalid-frame-type',
    message: 'invalid frame type {typeNumber}',
    typeNumber: null
});

/* jshint maxparams:5 */

module.exports = Frame;

function Frame(id, body) {
    if (!(this instanceof Frame)) {
        return new Frame(id, body);
    }
    var self = this;
    if (id === null || id === undefined) {
        self.id = Frame.NullId;
    } else {
        self.id = id;
    }
    self.body = body;
}

Frame.Overhead = 0x10;
Frame.MaxBodySize = 0xffff - Frame.Overhead;
Frame.MaxId = 0xfffffffe;
Frame.NullId = 0xffffffff;

// size:2: type:1 reserved:1 id:4 reserved:8 ...
Frame.read = read.chained(read.series([
    read.UInt16BE, // size:2
    read.UInt8,    // type:1
    read.skip(1),  // reserved:1
    read.UInt32BE, // id:4
    read.skip(8)   // reserved:8
                   // ...
]), function headerRead(head, buffer, offset) {
    var length = head[0];
    var type = head[1];
    var id = head[3];

    var BodyType = Frame.Types[type];
    if (!BodyType) {
        return [InvalidFrameTypeError({typeNumber: type}), offset, null];
    }

    // don't use read.len here to avoid doing a potentially large slice
    var bodyLength = length - Frame.Overhead;
    var err = read.want(bodyLength, buffer, offset);
    if (err) return [err, offset, null];

    var end = offset + bodyLength;

    return read.chain(BodyType.read, buffer, offset, buildFrame);

    function buildFrame(body, buffer, offset) {
        if (offset < end) {
            return [ExtraFrameDataError({
                length: length,
                trailing: end - offset
            }), offset, null];
        }
        var frame = new Frame(id, body);
        return [null, offset, frame];
    }
});

// size:2: type:1 reserved:1 id:4 reserved:8 ...
Frame.prototype.write = function writeFrame() {
    var self = this;
    var body = self.body.write();
    if (body.length > Frame.MaxBodySize) {
        throw FieldTooLargeError({
            field: 'frame body',
            length: body.length,
            max: Frame.MaxBodySize
        });
    }
    var len = Frame.Overhead + body.length;
    return write.series([
        write.UInt16BE(len, 'frame length'),       // size:2
        write.UInt8(self.body.type, 'frame type'), // type:1
        write.fill(0, 1),                          // reserved:1
        write.UInt32BE(self.id, 'frame id'),       // id:4
        write.fill(0, 8),                          // reserved:8
        body                                       // ...
    ]);
};

Frame.prototype.toBuffer = function toBuffer() {
    var self = this;
    return self.write().create();
};

Frame.Types = {};
