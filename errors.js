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

module.exports.Arg1OverLengthLimit = TypedError({
    type: 'tchannel.arg1-over-length-limit',
    message: 'arg 1 length {length} is larger than the limit {limit}',
    length: null,
    limit: null
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

module.exports.InvalidErrorCodeError = TypedError({
    type: 'tchannel.invalid-error-code',
    message: 'invalid tchannel error code {errorCode}',
    errorCode: null,
    originalId: null
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

module.exports.InvalidJSONBody = TypedError({
    type: 'tchannel-handler.json.invalid-body',
    message: 'Invalid error body, expected a typed-error',
    isSerializationError: true,
    head: null,
    body: null
});

module.exports.JSONBodyParserError = WrappedError({
    type: 'tchannel-json-handler.parse-error.body-failed',
    message: 'Could not parse body (arg3) argument.\n' +
        'Expected JSON encoded arg3 for endpoint {endpoint}.\n' +
        'Got {bodyStr} instead of JSON.',
    isSerializationError: true,
    endpoint: null,
    direction: null,
    bodyStr: null
});

module.exports.JSONBodyStringifyError = WrappedError({
    type: 'tchannel-json-handler.stringify-error.body-failed',
    message: 'Could not stringify body (res2) argument.\n' +
        'Expected JSON serializable res2 for endpoint {endpoint}.',
    isSerializationError: true,
    endpoint: null,
    body: null,
    direction: null
});

module.exports.JSONHeadParserError = WrappedError({
    type: 'tchannel-json-handler.parse-error.head-failed',
    message: 'Could not parse head (arg2) argument.\n' +
        'Expected JSON encoded arg2 for endpoint {endpoint}.\n' +
        'Got {headStr} instead of JSON.',
    isSerializationError: true,
    endpoint: null,
    direction: null,
    headStr: null
});

module.exports.JSONHeadStringifyError = WrappedError({
    type: 'tchannel-json-handler.stringify-error.head-failed',
    message: 'Could not stringify head (res1) argument.\n' +
        'Expected JSON serializable res1 for endpoint {endpoint}.',
    isSerializationError: true,
    endpoint: null,
    head: null,
    direction: null
});

module.exports.MaxPendingError = TypedError({
    type: 'tchannel.max-pending',
    message: 'maximum pending requests exceeded (limit was {pending})',
    pending: null
});

module.exports.MaxPendingForServiceError = TypedError({
    type: 'tchannel.max-pending-for-service',
    message: 'maximum pending requests exceeded for service (limit was {pending} for service {serviceName})',
    pending: null,
    serviceName: null
});

module.exports.MissingInitHeaderError = TypedError({
    type: 'tchannel.missing-init-header',
    message: 'missing init frame header {field}',
    field: null
});

module.exports.NoPeerAvailable = TypedError({
    type: 'tchannel.no-peer-available',
    message: 'no peer available for request'
});

module.exports.NoServiceHandlerError = TypedError({
    type: 'tchannel.no-service-handler',
    message: 'unknown service {serviceName}',
    serviceName: null
});

module.exports.NullKeyError = TypedError({
    type: 'tchannel.null-key',
    message: 'null key',
    offset: null,
    endOffset: null
});

module.exports.ReconstructedError = TypedError({
    type: 'tchannel.hydrated-error.default-type',
    message: 'TChannel json hydrated error;' +
        ' this message should be replaced with an upstream error message'
});

module.exports.ResponseAlreadyStarted = TypedError({
    type: 'tchannel.response-already-started',
    message: 'response already started (state {state})',
    state: null
});

module.exports.ResponseAlreadyDone = TypedError({
    type: 'tchannel.response-already-done',
    message: 'cannot send {attempted}, response already done',
    attempted: null
});

module.exports.ResponseFrameState = TypedError({
    type: 'tchannel.response-frame-state',
    message: 'cannot send {attempted} in {state} response state',
    attempted: null,
    state: null
});

module.exports.RequestAlreadyDone = TypedError({
    type: 'tchannel.request-already-done',
    message: 'cannot {attempted}, request already done',
    attempted: null
});

module.exports.RequestFrameState = TypedError({
    type: 'tchannel.request-frame-state',
    message: 'cannot send {attempted} in {state} request state',
    attempted: null,
    state: null
});

module.exports.SocketError = WrappedError({
    type: 'tchannel.socket',
    message: 'tchannel socket error ({code} from {syscall}): {origMessage}',
    hostPort: null,
    direction: null,
    remoteAddr: null
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

module.exports.ThriftBodyParserError = WrappedError({
    type: 'tchannel-thrift-handler.parse-error.body-failed',
    message: 'Could not parse body (arg3) argument.\n' +
        'Expected Thrift encoded arg3 for endpoint {endpoint}.\n' +
        'Got {bodyBuf} instead of Thrift.',
    isSerializationError: true,
    endpoint: null,
    direction: null,
    ok: null,
    bodyBuf: null
});

module.exports.ThriftBodyStringifyError = WrappedError({
    type: 'tchannel-thrift-handler.stringify-error.body-failed',
    message: 'Could not stringify body (res2) argument.\n' +
        'Expected Thrift serializable res2 for endpoint {endpoint}.',
    isSerializationError: true,
    endpoint: null,
    ok: null,
    body: null,
    direction: null
});

module.exports.ThriftHeadParserError = WrappedError({
    type: 'tchannel-thrift-handler.parse-error.head-failed',
    message: 'Could not parse head (arg2) argument.\n' +
        'Expected Thrift encoded arg2 for endpoint {endpoint}.\n' +
        'Got {headBuf} instead of Thrift.',
    isSerializationError: true,
    endpoint: null,
    ok: null,
    direction: null,
    headBuf: null
});

module.exports.ThriftHeadStringifyError = WrappedError({
    type: 'tchannel-thrift-handler.stringify-error.head-failed',
    message: 'Could not stringify head (res1) argument.\n' +
        'Expected Thrift serializable res1 for endpoint {endpoint}.',
    isSerializationError: true,
    endpoint: null,
    ok: null,
    head: null,
    direction: null
});

module.exports.TimeoutError = TypedError({
    type: 'tchannel.timeout',
    message: 'timed out after {elapsed}ms (limit was {timeout}ms)',
    id: null,
    start: null,
    elapsed: null,
    timeout: null
});

module.exports.TopLevelRegisterError = TypedError({
    type: 'tchannel.top-level-register',
    message: 'Cannot register endpoints points on top-level channel.\n' +
        'Provide serviceName to constructor, or create a sub-channel.'
});

module.exports.TopLevelRequestError = TypedError({
    type: 'tchannel.top-level-request',
    message: 'Cannot make request() on top level tchannel without service or host.\n' +
        'Must provide either a known service, a direct host, or use a sub channel directly.'
});

module.exports.UnimplementedMethod = TypedError({
    message: 'Unimplemented {className}#{methodName}',
    type: 'tchannel.unimplemented-method',
    className: null,
    methodName: null
});


module.exports.classify = function classify(err) {
    if (err.isErrorFrame) {
        return err.codeName;
    }

    switch (err.type) {
        case 'tchannel.no-peer-available':
        case 'tchannel.no-service-handler':
        case 'tchannel.max-pending':
        case 'tchannel.max-pending-for-service':
            return 'Declined';

        case 'tchannel.timeout':
            return 'Timeout';

        case 'tchannel-handler.parse-error.body-failed':
        case 'tchannel-handler.parse-error.head-failed':
        case 'tchannel.checksum':
        case 'tchannel.duplicate-header-key':
            return 'BadRequest';

        case 'tchannel.arg-chunk.gap':
        case 'tchannel.arg-chunk.out-of-order':
        case 'tchannel.invalid-code-string':
        case 'tchannel.invalid-error-code':
        case 'tchannel.invalid-frame-type':
        case 'tchannel.missing-init-header':
        case 'tchannel.null-key':
        case 'tchannel.protocol.read-failed':
        case 'tchannel.protocol.write-failed':
        case 'tchannel.unhandled-frame-type':
            return 'ProtocolError';

        case 'tchannel.socket':
        case 'tchannel.socket-closed':
            return 'NetworkError';

        default:
            return null;
    }
};
