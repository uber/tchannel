# TChannel

Below we document the interface of tchannel itself; This includes

 - `makeSubChannel`
 - `request().send()`
 - `register()`
 - `listen()`

## Stability: stable

[![stable](http://badges.github.io/stability-badges/dist/stable.svg)](http://github.com/badges/stability-badges)

## `var channel = TChannel(options)`

To create a `channel` you call `TChannel` with some options.

```js
var TChannel = require('tchannel');

var channel = TChannel();
channel.listen(8080, '127.0.0.1');
```

### `options.statTags`

You must specify tag information for the stats support. The
following four fields are available:

 - required: `options.statTags.app` name of your app
 - `options.statTags.host` the hostname of the server
 - `options.statTags.cluster` the name of the cluster
 - `options.statTags.version` the version of your application

### `options.statsd`

You can pass a `statsd` instance into TChannel. If you pass a
`statsd` client in we will hook up the `'stat'` event to the
statsd client.

Check out the [stats document](./statsd.md) to see what stats
we will emit

We recommend using `uber-statsd-client`

### `options.logger`

You can pass in your own logger instance. This will default to
    a null logger that prints no information.

The logger you pass in must implement `debug`, `info`, `warn`,
    `error` and `fatal` methods.

We recommend using `logtron`

### `options.requestDefaults`

You can specify default values for all outgoing requests on
a per channel basis.

You can pass an object; for example

```js
var channel = TChannel({
    requestDefaults: {
        hasNoParent: true,
        headers: {
            'as': 'raw',
            'cn': 'testy-test'
        }
    }
})
```

### `options.trace`

There is a `trace` boolean that can be used to turn tracing off
by setting it to `false`. Tracing defaults to true.

It's recommend you run with tracing permanently on.

### `options.traceReporter`

If you want to implement a custom reporter for tracing information
then you can specifiy a `traceReporter` function.

By default this is not needed; the hyperbahn client comes with
a tcollector reporter that will be wired up for you.

### `channel.listen(port, host, callback?)`

Starts listening on the given port and host.

Both port and host are mandatory.

The port may be 0, indicating that the operating system must grant an
available ephemeral port.

The eventual host and port combination must uniquely identify the
TChannel server and it is strongly recommended that the host be the
public IP address.

### `channel.hostPort`

Once you've called listen the channel will have a `hostPort` that
you can access in the case you called `listen(0)`.

### `channel.close(cb)`

When you want to close your channel you call `.close()`. This
will cleanup the tcp server and any tcp sockets as well
as cleanup any inflight operations.

Your `cb` will get called when it's finished.

### `channel.TChannelAsThrift`

The channel exposes the `TChannelAsThrift` implementation. This
means you only have to import tchannel and can use the thrift
implementation from the `channel` instance

### `channel.TChannelAsJSON`

The channel exposes the `TChannelAsJSON` implementation. This
means you only have to import tchannel and can use the json
implementation from the `channel` instance
