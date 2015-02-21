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

module.exports.ShortChunkRead = TypedError({
    type: 'tchannel.short-chunk-read',
    message: "didn't consume {remaining} bytes from incomnig chunk buffer",
    remaining: null
});

module.exports.ExtraFrameDataError = TypedError({
    type: 'tchannel.extra-frame-data',
    message: 'got {trailing} bytes of extra frame data beyond body',
    length: null,
    trailing: null
});

module.exports.InvalidFrameLengthError = TypedError({
    type: 'tchannel.invalid-frame-length',
    message: 'invalid frame length, must be at least 16 bytes'
});

module.exports.InvalidFrameTypeError = TypedError({
    type: 'tchannel.invalid-frame-type',
    message: 'invalid frame type {typeNumber}',
    typeNumber: null
});

module.exports.DuplicateInitHeaderError = TypedError({
    type: 'tchannel.duplicate-init-header',
    message: 'duplicate init frame header {name}',
    name: null
});

module.exports.InvalidInitHeaderError = TypedError({
    type: 'tchannel.invalid-init-header',
    message: 'invalid init frame header {name}',
    name: null
});

module.exports.ChecksumError = TypedError({
    type: 'tchannel.checksum-error',
    message: 'invalid checksum',
    checksumType: null,
    expectedValue: null,
    actualValue: null
});

module.exports.BrokenParserStateError = TypedError({
    type: 'tchannel.broken-parser-state',
    message: 'parser in invalid state {state}',
    state: null
});

module.exports.DuplicateHeaderKeyError = TypedError({
    type: 'tchannel.duplicate-header-key',
    message: 'duplicate header key {key}',
    key: null,
    value: null,
    priorValue: null
});

module.exports.TruncatedParseError = TypedError({
    type: 'tchannel.broken-parser-state',
    message: 'parse truncated by end of stream with {length} bytes in buffer',
    length: null,
    buffer: null,
    state: null,
    expecting: null
});
