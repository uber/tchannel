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

var bufrw = require('bufrw');
var TypedError = require('error/typed');

// var BufferTooSmallError = TypedError({
//     type: 'tchannel.buffer-too-small',
//     message: 'buffer too small, needed {expected} only have {got} bytess',
//     expected: null,
//     got: null
// });

// TODO need?
// var ExtraFrameDataError = TypedError({
//     type: 'tchannel.extra-frame-data',
//     message: 'got {trailing} bytes of extra frame data beyond body',
//     frame: null,
//     trailing: null
// });

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
    self.size = 0;
    self.type = (body && body.type) || 0;
    if (id === null || id === undefined) {
        self.id = Frame.NullId;
    } else {
        self.id = id;
    }
    self.body = body;
}

Frame.Overhead = 0x10;
Frame.MaxSize = 0xffff;
Frame.MaxBodySize = Frame.MaxSize - Frame.Overhead;
Frame.MaxId = 0xfffffffe;
Frame.NullId = 0xffffffff;

// size:2: type:1 reserved:1 id:4 reserved:8 ...
Frame.RW = bufrw.Base(frameLength, readFrameFrom, writeFrameInto);

function frameLength(frame) {
    var body = frame.body;
    var bodyRW = body.constructor.RW;

    var length = 0;
    length += bufrw.UInt16BE.width;
    length += bufrw.UInt8.width;
    length += 1;
    length += bufrw.UInt32BE.width;
    length += 8;

    var res = bodyRW.byteLength(body);
    if (!res.err) {
        res.length += length;
    }
    return res;
}

function readFrameFrom(buffer, offset) {
    var frame = Frame();

    var res;

    res = bufrw.UInt16BE.readFrom(buffer, offset);
    if (res.err) return res;
    offset = res.offset;
    frame.size = res.value;

    res = bufrw.UInt8.readFrom(buffer, offset);
    if (res.err) return res;
    offset = res.offset;
    frame.type = res.value;

    var BodyType = Frame.Types[frame.type];
    if (!BodyType) {
        return bufrw.ReadResult.error(InvalidFrameTypeError({
            typeNumber: frame.type
        }), offset);
    }

    offset += 1;

    res = bufrw.UInt32BE.readFrom(buffer, offset);
    if (res.err) return res;
    offset = res.offset;
    frame.id = res.value;

    offset += 8;

    res = BodyType.RW.readFrom(buffer, offset);
    if (res.err) return res;
    offset = res.offset;
    frame.body = res.value;

    // TODO need?
    // if (offset < buffer.length) {
    //     return bufrw.ReadResult.error(ExtraFrameDataError({
    //         frame: frame,
    //         trailing: buffer.length - offset
    //     }), offset, frame);
    // }

    res.value = frame;
    return res;
}

function writeFrameInto(frame, buffer, offset) {
    var body = frame.body;
    var bodyRW = body.constructor.RW;

    // TODO: need?
    // var got = buffer.length - offset;
    // if (got < frame.size) {
    //     return bufrw.WriteResult.error(BufferTooSmallError({
    //         expected: frame.size,
    //         got: got
    //     }));
    // }

    var res;
    var end;
    var start = offset;

    // skip size, write later
    offset += bufrw.UInt16BE.width;

    res = bufrw.UInt8.writeInto(frame.type, buffer, offset);
    if (res.err) return res;
    offset = res.offset;

    end = offset + 1;
    buffer.fill(0, offset, end);
    offset = end;

    res = bufrw.UInt32BE.writeInto(frame.id, buffer, offset);
    if (res.err) return res;
    offset = res.offset;

    end = offset + 8;
    buffer.fill(0, offset, end);
    offset = end;

    res = bodyRW.writeInto(body, buffer, offset);
    if (res.err) return res;
    offset = res.offset;

    frame.size = res.offset - start;
    if (frame.size > Frame.MaxSize) {
        return bufrw.WriteResult.error(FieldTooLargeError({
            field: 'frame body',
            length: frame.size - Frame.Overhead,
            max: Frame.MaxBodySize
        }));
    }

    res = bufrw.UInt16BE.writeInto(frame.size, buffer, start);
    if (res.err) return res;
    res.offset = offset;

    return res;
}

Frame.prototype.fromBuffer = function toBuffer(buffer) {
    var self = this;
    return bufrw.fromBuffer(Frame.RW, self, buffer);
};

Frame.prototype.byteLength = function byteLength() {
    var self = this;
    return bufrw.byteLength(Frame.RW, self);
};

Frame.prototype.intoBuffer = function intoBuffer(buffer) {
    var self = this;
    return bufrw.intoBuffer(Frame.RW, self, buffer);
};

Frame.prototype.toBuffer = function toBuffer() {
    var self = this;
    return bufrw.toBuffer(Frame.RW, self);
};

Frame.Types = {};
