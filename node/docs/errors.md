# Errors from tchannel

TChannel can return many different types of errors when
making outgoing requests

## Stability: stable

[![stable](http://badges.github.io/stability-badges/dist/stable.svg)](http://github.com/badges/stability-badges)

## TChannel client Errors. Errors from `.request().send()`

When making an `OutRequest` there are multiple edge cases
that can go happen. There are multiple operational errors that
can occur.

There are many different types of errors; for an exhaustive list
please check the [source code of `errors.js`](../errors.js)

 - `tchannel.protocol.write-failed` Your application is sending
    invalid tchannel frames
 - `ProtocolError` There are many different types protocol errors
    that can occur that fail your requests. Most of these are bugs
 - `tchannel.protocol.read-failed` The tchannel library can fail
    to read an incoming frame. When it does this it logs a 
    frame parser error
 - `isErrorFrame: true` When you make an outgoing call it's always
    possible to receive one of the error frames. All of these
    errors have an `isErrorFrame` boolean on them. You can read
    the [protocol docs](../../docs/protocol.md) for more info
    on what the error frames are.
 - `NetworkError` There are multiple types of TCP errors that can
    occur and these are all net work errors; when a connection
    dies any pending in or out requests will fail.
 - `TimeoutError` TChannel has per-request timeouts. This means
    any in request or out request can timeout when it's ttl is
    up.

## TChannel client Errors. Errors from `OutResponse.send()`

When sending an `OutResponse`, tchannel errors need be mapped to proper http
status codes/messages so that the client can differentiate errors and possibly 
take some actions.

A list of tchannel response errors:
[source code of `error_response.js`](../v2/error_response.js)

A list of http status code:
[http://www.w3.org/Protocols/rfc2616/rfc2616-sec10.html]

The proposed mapping is:

 - Codes.Timeout : 408 Request Timeout
 - Codes.BadRequest: 400 Bad Request
 - Codes.UnexpectedError: 500 Internal Server Error
 - Codes.Busy: 503 Service Unavailable
 - Codes.Unhealthy: 503 Service Unavailable
 - Codes.Declined: 403 Forbidden
 - Codes.Cancelled: TBD
 - Codes.NetworkError: TBD
 - Codes.ProtocolError: TBD
