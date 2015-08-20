# Streaming

TChannel supports streaming as a first class use-case

## Stability: unstable

[![unstable](http://badges.github.io/stability-badges/dist/unstable.svg)](http://github.com/badges/stability-badges)

In TChannel you can fully stream `arg2` and `arg3` as a stream of
binary Buffers.

## `subChannel.register(name, { streamed: true }, handler)`

To implement a streaming server you must call `register()` with
a options argument to opt into streaming.

The `handler` interface is different when doing streaming.

`handler(req, buildResponse)` - you get a streaming incoming 
request and you get a `buildResponse({ streamed: bool })` function
which takes options and can be used to build a streaming or
non-streaming outgoing response.

 - `req.arg1` A string or buffer
 - `req.arg2` A readable stream of buffers for arg1
 - `req.arg3` A readable stream of buffers for arg1

If you call `buildResponse` with `{ streamed: false }` it will
return the normal outgoing response as documented in the
[sub-channel](./sub-channel.md) documentation.

If you call `buildResponse` with `{ streamed: true }` it will
return a streaming out response with three fields. An `arg1`,
`arg2` and `arg3` field, all of which are writable streams of
buffers.

## `req = subChannel.request({ streamed: true })`

To making a streaming out request you can set the `streamed`
boolean to `true`.

The rest of the options are documented in the 
[sub-channel](./sub-channel.md) docs.

 - `req.arg1` A string or buffer
 - `req.arg2` A writable stream of buffers for arg2
 - `req.arg3` A writable stream of buffers for arg3

To handle the response you **should not** pass a callback
to `.send()`

Instead you should add a listener to `"response"` event on
the request; The incoming response will have three fields; `arg1`,
`arg2` and `arg3`. They are all readable streams of buffers.

```js
var req = subChan.request({
    streamed: true,
    serviceName: 'foo'
});

req.sendArg1('endpoint');
req.arg2.end('');
myStream.pipe(req.arg3);

req.on('error', function onError(err) {
    /* handle errors */
});
req.on('response', function onResponse(res) {
    // handle res.arg2 and res.arg3
});
```
