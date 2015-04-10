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

var TypedError = require('error/typed');
var WrappedError = require('error/wrapped');

module.exports.ArgChunkGapError = TypedError({
    type: 'tchannel.arg-chunk.gap',
    message: 'arg chunk gap, current: {current} got: {got}',
    current: null,
    got: null
});

module.exports.ArgChunkOutOfOrderError = TypedError({
    type: 'tchannel.arg-chunk.out-of-order',
    message: 'out of order arg chunk, current: {current} got: {got}',
    current: null,
    got: null
});

module.exports.ChecksumError = TypedError({
    type: 'tchannel.checksum',
    message: 'invalid checksum (type {checksumType}) expected: {expectedValue} actual: {actualValue}',
    checksumType: null,
    expectedValue: null,
    actualValue: null
});

module.exports.DuplicateHeaderKeyError = TypedError({
    type: 'tchannel.duplicate-header-key',
    message: 'duplicate header key {key}',
    offset: null,
    endOffset: null,
    key: null,
    value: null,
    priorValue: null
});

module.exports.InvalidArgumentError = TypedError({
    type: 'tchannel.invalid-argument',
    message: 'invalid argument, expected array or null',
    argType: null,
    argConstructor: null
});

module.exports.InvalidCodeStringError = TypedError({
    type: 'tchannel.invalid-code-string',
    message: 'Invalid Error frame code: {codeString}',
    codeString: null
});

module.exports.InvalidFrameTypeError = TypedError({
    type: 'tchannel.invalid-frame-type',
    message: 'invalid frame type {typeNumber}',
    typeNumber: null
});

module.exports.InvalidHandlerError = TypedError({
    type: 'tchannel.invalid-handler',
    message: 'invalid handler function'
});

module.exports.InvalidHandlerForRegister = TypedError({
    type: 'tchannel.invalid-handler.for-registration',
    message: 'Found unexpected handler when calling `.register()`.\n' +
        'You cannot set a custom handler when using `.register()`.\n' +
        '`.register()` is deprecated; use a proper handler.',
    handlerType: null,
    handler: null
});

module.exports.MissingInitHeaderError = TypedError({
    type: 'tchannel.missing-init-header',
    message: 'missing init frame header {field}',
    field: null
});

module.exports.NoServiceHandlerError = TypedError({
    type: 'tchannel.no-service-handler',
    message: 'unknown service {service}',
    service: null
});

module.exports.NullKeyError = TypedError({
    type: 'tchannel.null-key',
    message: 'null key',
    offset: null,
    endOffset: null
});

module.exports.SocketClosedError = TypedError({
    type: 'tchannel.socket-closed',
    message: 'socket closed, {reason}',
    reason: null
});

module.exports.TChannelListenError = WrappedError({
    type: 'tchannel.server.listen-failed',
    message: 'tchannel: {origMessage}',
    requestedPort: null,
    host: null
});

module.exports.TChannelReadProtocolError = WrappedError({
    type: 'tchannel.protocol.read-failed',
    message: 'tchannel read failure: {origMessage}',
    remoteName: null,
    localName: null
});

module.exports.TChannelUnhandledFrameTypeError = TypedError({
    type: 'tchannel.unhandled-frame-type',
    message: 'unhandled frame type {typeCode}',
    typeCode: null
});

module.exports.TChannelWriteProtocolError = WrappedError({
    type: 'tchannel.protocol.write-failed',
    message: 'tchannel write failure: {origMessage}',
    remoteName: null,
    localName: null
});

module.exports.TopLevelRegisterError = TypedError({
    type: 'tchannel.top-level-register',
    message: 'Cannot register endpoints points on top-level channel.\n' +
        'Provide serviceName to constructor, or create a sub-channel.'
});
