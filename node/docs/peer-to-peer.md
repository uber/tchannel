# Making peer to peer requests

TChannel is designed for interacting with a hyperbahn router.

The majority of the requests you make will be send directly
to the hyperbahn instances and will be routed based on the
`serviceName`

However tchannel can also be used to make peer to peer request
to individual tchannel instances

## Stability: unstable

[![unstable](http://badges.github.io/stability-badges/dist/unstable.svg)](http://github.com/badges/stability-badges)

## `subChannel.waitForIdentified(options, cb)`

To be able to make peer to peer requests you have to wait for
the init request/response to complete on the connection.

When doing logical retryable requests againsts a `serviceName`
tchannel will wait for init response to finish; However when making
a peer to peer request this is your responsibility

You can pass in `options.host` to wait for a connection to that
host to open; your `cb` will be called when it's opened.

We may give your `cb` an `err` if the connection failed

## `subChannel.request({ host: ... })`

You must `waitForIdentified` before making an outgoing peer to
peer request.

When making an outgoing request on a `subChannel` you can set
`options.host` to be `'{host}:{port}'` string. This will make
a direct request to that concrete host.

This request is a non-retryable request.

All other documentation for `request()` can be found in the
[sub-channel document](./sub-channels.md)
