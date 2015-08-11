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

// All exported errors must be in sorted order

module.exports.Arg1OverLengthLimit = TypedError({
    type: 'tchannel.arg1-over-length-limit',
    message: 'arg1 length {length} is larger than the limit {limit}',
    length: null,
    limit: null
});

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

module.exports.ArgStreamExceededFramePartsError = TypedError({
    type: 'tchannel.argstream.exceeded-frame-parts',
    message: 'frame parts exceeded stream arity'
});

module.exports.ArgStreamFinishedError = TypedError({
    type: 'tchannel.argstream.finished',
    message: 'arg stream already finished'
});

module.exports.ArgStreamUnimplementedError = TypedError({
    type: 'tchannel.argstream.unimplemented',
    message: 'un-streamed argument defragmentation is not implemented'
});

module.exports.ArgStreamUnknownFrameHandlingStateError = TypedError({
    type: 'tchannel.argstream.unknown-frame-handling-state',
    message: 'unknown frame handling state'
});

module.exports.AsHeaderRequired = TypedError({
    type: 'tchannel.handler.incoming-req-as-header-required',
    message: 'Expected incoming call {frame} to have "as" header set.',
    frame: null
});

module.exports.CallReqBeforeInitReqError = TypedError({
    type: 'tchannel.init.call-request-before-init-request',
    message: 'call request before init request'
});

module.exports.CallReqContBeforeInitReqError = TypedError({
    type: 'tchannel.init.call-request-cont-before-init-request',
    message: 'call request cont before init request'
});

module.exports.CallResBeforeInitResError = TypedError({
    type: 'tchannel.init.call-response-before-init-response',
    message: 'call response before init response'
});

module.exports.CallResContBeforeInitResError = TypedError({
    type: 'tchannel.init.call-response-cont-before-init-response',
    message: 'call response cont before init response'
});

module.exports.ChecksumError = TypedError({
    type: 'tchannel.checksum',
    message: 'invalid checksum (type {checksumType}) expected: {expectedValue} actual: {actualValue}',
    checksumType: null,
    expectedValue: null,
    actualValue: null
});

module.exports.CnHeaderRequired = TypedError({
    type: 'tchannel.handler.incoming-req-cn-header-required',
    message: 'Expected incoming call request to have "cn" header set.'
});

module.exports.ConnectionStaleTimeoutError = TypedError({
    type: 'tchannel.connection-stale.timeout',
    message: 'Connection got two timeouts in a row.\n' +
        'Connection has been marked as stale and will be timed out',
    lastTimeoutTime: null
});

module.exports.ConnectionTimeoutError = TypedError({
    type: 'tchannel.connection.timeout',
    message: 'connection timed out after {elapsed}ms ' +
        '(limit was {timeout}ms)',
    id: null,
    start: null,
    elapsed: null,
    timeout: null
});

module.exports.CorruptWriteLazyFrame = TypedError({
    type: 'tchannel.lazy-frame.write-corrupt',
    message: 'could not serialize lazy frame due to {context}',
    context: null
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

module.exports.DuplicateInitRequestError = TypedError({
    type: 'tchannel.init.duplicate-init-request',
    message: 'tchannel: duplicate init request'
});

module.exports.DuplicateInitResponseError = TypedError({
    type: 'tchannel.init.duplicate-init-response',
    message: 'tchannel: duplicate init response'
});

module.exports.EphemeralInitResponse = TypedError({
    type: 'tchannel.init.ephemeral-init-response',
    message: 'tchannel: got invalid 0.0.0.0:0 as hostPort in Init Response',
    hostPort: null,
    socketRemoteAddr: null,
    processName: null
});

module.exports.HTTPReqArg2fromBufferError = WrappedError({
    type: 'tchannel.http-handler.from-buffer-arg2.req-failed',
    message: 'Could not read from buffer when sending request.',
    isSerializationError: true,
    arg2: null
});

module.exports.HTTPReqArg2toBufferError = WrappedError({
    type: 'tchannel.http-handler.to-buffer-arg2.req-failed',
    message: 'Could not write to buffer when sending request.',
    isSerializationError: true,
    head: null
});

module.exports.HTTPResArg2fromBufferError = WrappedError({
    type: 'tchannel.http-handler.from-buffer-arg2.res-failed',
    message: 'Could not read from buffer when sending response.',
    isSerializationError: true,
    arg2: null
});

module.exports.HTTPResArg2toBufferError = WrappedError({
    type: 'tchannel.http-handler.to-buffer-arg2.res-failed',
    message: 'Could not write to buffer when sending response.',
    isSerializationError: true,
    head: null
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

module.exports.InvalidHeaderTypeError = TypedError({
    type: 'tchannel.invalid-header-type',
    message: 'invalid header type for header {name}; ' +
        'expected string, got {headerType}',
    headerType: null,
    name: null
});

module.exports.InvalidJSONBody = TypedError({
    type: 'tchannel-handler.json.invalid-body',
    message: 'Invalid error body, expected a typed-error',
    isSerializationError: true,
    head: null,
    body: null
});

module.exports.InvalidTTL = TypedError({
    type: 'tchannel.protocol.invalid-ttl',
    message: 'Got an invalid ttl. Expected positive ttl but got {ttl}',
    ttl: null
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

module.exports.LocalSocketCloseError = TypedError({
    type: 'tchannel.socket-local-closed',
    message: 'tchannel: Connection was manually closed.'
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

module.exports.OrphanCallRequestCont = TypedError({
    type: 'tchannel.call-request.orphan-cont',
    message: 'orphaned call request cont',
    frameId: null
});

module.exports.OrphanCallResponseCont = TypedError({
    type: 'tchannel.call-response.orphan-cont',
    message: 'orphaned call response cont',
    frameId: null
});

module.exports.ParentRequired = TypedError({
    type: 'tchannel.tracer.parent-required',
    message: 'parent not specified for outgoing call req.\n' +
        'Expected either a parent or hasNoParent.\n' +
        'For the call to {serviceName}.\n',
    parentSpan: null,
    hasNoParent: null,
    serviceName: null
});

module.exports.ReconstructedError = TypedError({
    type: 'tchannel.hydrated-error.default-type',
    message: 'TChannel json hydrated error;' +
        ' this message should be replaced with an upstream error message'
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

module.exports.RequestTimeoutError = TypedError({
    type: 'tchannel.request.timeout',
    message: 'request timed out after {elapsed}ms ' +
        '(limit was {timeout}ms)',
    id: null,
    start: null,
    elapsed: null,
    timeout: null,
    logical: false
});

module.exports.ResponseAlreadyDone = TypedError({
    type: 'tchannel.response-already-done',
    message: 'cannot send {attempted}, response already done ' +
        'in state: {currentState}',
    attempted: null,
    currentState: null
});

module.exports.ResponseAlreadyStarted = TypedError({
    type: 'tchannel.response-already-started',
    message: 'response already started (state {state})',
    state: null
});

module.exports.ResponseFrameState = TypedError({
    type: 'tchannel.response-frame-state',
    message: 'cannot send {attempted} in {state} response state',
    attempted: null,
    state: null
});

module.exports.SendCallReqBeforeIdentifiedError = TypedError({
    type: 'tchannel.init.send-call-request-before-indentified',
    message: 'cannot send call request before the connection is identified'
});

module.exports.SendCallReqContBeforeIdentifiedError = TypedError({
    type: 'tchannel.init.send-call-request-cont-before-indentified',
    message: 'cannot send call request cont before the connection is identified'
});

module.exports.SendCallResBeforeIdentifiedError = TypedError({
    type: 'tchannel.init.send-call-response-before-indentified',
    message: 'cannot send call response before the connection is identified'
});

module.exports.SendCallResContBeforeIdentifiedError = TypedError({
    type: 'tchannel.init.send-call-response-cont-before-indentified',
    message: 'cannot send call response cont before the connection is identified'
});

module.exports.SocketClosedError = TypedError({
    type: 'tchannel.socket-closed',
    message: 'socket closed, {reason}',
    reason: null
});

module.exports.SocketError = WrappedError({
    type: 'tchannel.socket',
    message: 'tchannel socket error ({code} from {syscall}): {origMessage}',
    hostPort: null,
    direction: null,
    remoteAddr: null
});

module.exports.TChannelConnectionCloseError = TypedError({
    type: 'tchannel.connection.close',
    message: 'connection closed'
});

module.exports.TChannelConnectionResetError = WrappedError({
    type: 'tchannel.connection.reset',
    message: 'tchannel: {causeMessage}'
});

module.exports.TChannelDestroyedError = TypedError({
    type: 'tchannel.destroyed',
    message: 'the channel is destroyed'
});

module.exports.TChannelListenError = WrappedError({
    type: 'tchannel.server.listen-failed',
    message: 'tchannel: {origMessage}',
    requestedPort: null,
    host: null
});

module.exports.TChannelLocalResetError = WrappedError({
    type: 'tchannel.local.reset',
    message: 'tchannel: {causeMessage}'
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
        'Got {bodyBuf} instead of Thrift.\n' +
        'Parsing error was: {causeMessage}.\n',
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
        'Got {headBuf} instead of Thrift.\n' +
        'Parsing error was: {causeMessage}.\n',
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

module.exports.TooManyHeaders = TypedError({
    type: 'tchannel.protocol.too-many-headers',
    message: 'too many transport headers, got {count}, expected at most {maxHeaderCount}',
    count: null,
    maxHeaderCount: null,
    offset: null,
    endOffset: null
});

module.exports.TopLevelRegisterError = TypedError({
    type: 'tchannel.top-level-register',
    message: 'Cannot register endpoints points on top-level channel.\n' +
        'Provide serviceName to constructor, or create a sub-channel.'
});

module.exports.TopLevelRequestError = TypedError({
    type: 'tchannel.top-level-request',
    message: 'Cannot make request() on top level tchannel.\n' +
        'Must use a sub channel directly.'
});

module.exports.TransportHeaderTooLong = TypedError({
    type: 'tchannel.transport-header-too-long',
    message: 'transport header: {headerName} exceeds {maxLength} bytes',
    maxLength: null,
    headerName: null,
    offset: null,
    endOffset: null
});

module.exports.UnimplementedMethod = TypedError({
    message: 'Unimplemented {className}#{methodName}',
    type: 'tchannel.unimplemented-method',
    className: null,
    methodName: null
});

module.exports.UnknownConnectionReset = TypedError({
    type: 'tchannel.connection.unknown-reset',
    message: 'unknown connection reset'
});

// utilities

module.exports.classify = function classify(err) {
    if (err.isErrorFrame) {
        return err.codeName;
    }

    switch (err.type) {
        case 'tchannel.max-pending':
        case 'tchannel.max-pending-for-service':
        case 'tchannel.no-peer-available':
        case 'tchannel.no-service-handler':
            return 'Declined';

        case 'tchannel.connection-stale.timeout':
        case 'tchannel.connection.timeout':
        case 'tchannel.request.timeout':
            return 'Timeout';

        case 'tchannel-handler.json.invalid-body':
        case 'tchannel-json-handler.parse-error.body-failed':
        case 'tchannel-json-handler.parse-error.head-failed':
        case 'tchannel-thrift-handler.parse-error.body-failed':
        case 'tchannel-thrift-handler.parse-error.head-failed':
        case 'tchannel.arg1-over-length-limit':
        case 'tchannel.argstream.exceeded-frame-parts':
        case 'tchannel.checksum':
        case 'tchannel.duplicate-header-key':
        case 'tchannel.http-handler.to-buffer-arg2.req-failed':
        case 'tchannel.http-handler.to-buffer-arg2.res-failed':
        case 'tchannel.null-key':
        case 'tchannel.request-already-done':
        case 'tchannel.request-frame-state':
            return 'BadRequest';

        case 'tchannel.arg-chunk.gap':
        case 'tchannel.arg-chunk.out-of-order':
        case 'tchannel.argstream.finished':
        case 'tchannel.argstream.unimplemented':

        // TODO: really we'd rather classify as BadRequest. see note in
        // TChannelV2Handler#handleCallRequestCont wrt frame id association
        // support
        case 'tchannel.call-request.orphan-cont':

        // TODO: can BadRequest be used for a response error? Maybe instead we
        // could use UnexpectedError rather than terminate the connection?
        case 'tchannel.call-response.orphan-cont':

        case 'tchannel.handler.incoming-req-as-header-required':
        case 'tchannel.handler.incoming-req-cn-header-required':
        case 'tchannel.init.call-request-before-init-request':
        case 'tchannel.init.call-request-cont-before-init-request':
        case 'tchannel.init.call-response-before-init-response':
        case 'tchannel.init.call-response-cont-before-init-response':
        case 'tchannel.init.duplicate-init-request':
        case 'tchannel.init.duplicate-init-response':
        case 'tchannel.init.ephemeral-init-response':
        case 'tchannel.init.send-call-request-before-indentified':
        case 'tchannel.init.send-call-request-cont-before-indentified':
        case 'tchannel.init.send-call-response-before-indentified':
        case 'tchannel.init.send-call-response-cont-before-indentified':
        case 'tchannel.invalid-error-code':
        case 'tchannel.invalid-frame-type':
        case 'tchannel.missing-init-header':
        case 'tchannel.protocol.invalid-ttl':
        case 'tchannel.protocol.read-failed':
        case 'tchannel.protocol.too-many-headers':
        case 'tchannel.protocol.write-failed':
        case 'tchannel.transport-header-too-long':
        case 'tchannel.unhandled-frame-type':
            return 'ProtocolError';

        case 'tchannel.connection.close':
        case 'tchannel.connection.reset':
        case 'tchannel.destroyed':
        case 'tchannel.local.reset':
        case 'tchannel.socket':
        case 'tchannel.socket-closed':
        case 'tchannel.socket-local-closed':
            return 'NetworkError';

        case 'tchannel-json-handler.stringify-error.body-failed':
        case 'tchannel-json-handler.stringify-error.head-failed':
        case 'tchannel-thrift-handler.stringify-error.body-failed':
        case 'tchannel-thrift-handler.stringify-error.head-failed':
        case 'tchannel.argstream.unknown-frame-handling-state':
        case 'tchannel.connection.unknown-reset':
        case 'tchannel.http-handler.from-buffer-arg2.req-failed':
        case 'tchannel.http-handler.from-buffer-arg2.res-failed':
        case 'tchannel.hydrated-error.default-type':
        case 'tchannel.invalid-argument':
        case 'tchannel.invalid-handler':
        case 'tchannel.invalid-handler.for-registration':
        case 'tchannel.invalid-header-type':
        case 'tchannel.lazy-frame.write-corrupt':
        case 'tchannel.response-already-done':
        case 'tchannel.response-already-started':
        case 'tchannel.response-frame-state':
        case 'tchannel.server.listen-failed':
        case 'tchannel.top-level-register':
        case 'tchannel.top-level-request':
        case 'tchannel.tracer.parent-required':
        case 'tchannel.unimplemented-method':
            return 'UnexpectedError';

        default:
            return null;
    }
};

// To determine whether a circuit should break for each response code.
// TODO consider whether to keep a circuit healthy if a downstream circuit is
// unhealthy.
var symptoms = {
    'BadRequest': false, // not an indicator of bad health
    'Cancelled': false, // not an indicator of bad health
    'Unhealthy': true,
    'Timeout': true,
    'Busy': true,
    'Declined': true,
    'UnexpectedError': true,
    'NetworkError': true,
    'ProtocolError': true
};

module.exports.isUnhealthy = function isUnhealthy(code) {
    return symptoms[code];
};
