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

var BufferTooSmallError = TypedError({
    type: 'tchannel.buffer-too-small',
    message: 'buffer too small, needed {expected} only have {got} bytess',
    expected: null,
    got: null
});

var ExtraFrameDataError = TypedError({
    type: 'tchannel.extra-frame-data',
    message: 'got {trailing} bytes of extra frame data beyond body',
    frame: null,
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
Frame.RW = bufrw.Struct(Frame, [
    {call: {
        writeInto: function writeInto(frame, buffer, offset) {
            var body = frame.body;
            var bodyRW = body.constructor.RW;
            var res = bodyRW.byteLength(body);
            if (res.err) {
                return bufrw.WriteResult.error(res.err);
            }
            if (res.length > Frame.MaxBodySize) {
                return bufrw.WriteResult.error(FieldTooLargeError({
                    field: 'frame body',
                    length: res.length,
                    max: Frame.MaxBodySize
                }));
            }
            frame.size = Frame.Overhead + res.length;
            var got = buffer.length - offset;
            if (got < frame.size) {
                return bufrw.WriteResult.error(BufferTooSmallError({
                    expected: frame.size,
                    got: got
                }));
            }
            return bufrw.WriteResult.just(offset);
        }
    }},
    {name: 'size', rw: bufrw.UInt16BE}, // size:2
    {name: 'type', rw: bufrw.UInt8},    // type:1
    {rw: bufrw.Skip(1)},                // reserved:1
    {name: 'id', rw: bufrw.UInt32BE},   // id:4
    {rw: bufrw.Skip(8)},                // reserved:8
    {name: 'body', call: {              // ...
        byteLength: function byteLength(frame) {
            var body = frame.body;
            var bodyRW = body.constructor.RW;
            return bodyRW.byteLength(body);
        },
        writeInto: function writeInto(frame, buffer, offset) {
            var body = frame.body;
            var bodyRW = body.constructor.RW;
            return bodyRW.writeInto(body, buffer, offset);
        },
        readFrom: function readBodyFrom(frame, buffer, offset) {
            var BodyType = Frame.Types[frame.type];
            if (!BodyType) {
                return bufrw.ReadResult.error(InvalidFrameTypeError({
                    typeNumber: frame.type
                }), offset);
            }
            var res = BodyType.RW.readFrom(buffer, offset);
            if (res.err) return res;
            offset = res.offset;
            if (offset < buffer.length) {
                return bufrw.ReadResult.error(ExtraFrameDataError({
                    frame: frame,
                    trailing: buffer.length - offset
                }), offset, frame);
            }
            return res;
        }
    }}
]);

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
