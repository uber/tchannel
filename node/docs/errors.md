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
