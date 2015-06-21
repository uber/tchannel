# Hyperbahn client

To be able to make requests to a hyperbahn router it's recommended
that you use the hyperbahn client.

The hyperbahn client makes it easy to make requests to any service
that hyperbahn knows about and makes it easy to advertise your
service with hyperbahn.

The hyperbahn client has a few important methods

 - `hyperbahnClient.advertise();`
 - `hyperbahnClient.getClientChannel({ serviceName: '...' });`

## Stability: stable

[![stable](http://badges.github.io/stability-badges/dist/stable.svg)](http://github.com/badges/stability-badges)

## `var hyperbahnClient = HyperbahnClient(options)`

```js
var hyperbahnSeedList = [...];
var HyperbahnClient = require('tchannel/hyperbahn/');

var hyperbahnClient = HyperbahnClient({
    tchannel: tchannel,
    serviceName: 'my-service',
    hostPortList: hyperbahnSeedList,
    logger: logger,
    statsd: statsd,
    hardFail: true
});

hyperbahnClient.advertise();
hyperbahnClient.once('advertised', onAdvertised);

function onAdvertised() {
    /* hooray! */
}
```

The hyperbahnClient is used to `advertise()` with the hyperbahn
router which will advertise your serviceName.

It's also used to get a subchannel when making out going requests
through the hyperbahn router

### `options.tchannel`

The root channel that `hyperbahnClient` will use to advertise
to hyperbahn with.

### `options.serviceName`

The `serviceName` of your service. This is what you will advertise
to hyperbahn. Other services will use this `serviceName` to make
calls to you.

### `options.hostPortList`

The `hostPortList` is the seed list for the hyperbahn network. For
you to be able to bootstrap onto the hyperbahn router you need
to know where hyperbahn is.

It's recommended that this is stored on disk in a JSON file on
every host in your datacenter. You should read it off disk and
pass it to the hyperbahn client so that it can reach the hyperbahn
router.

### `options.logger`

A logger that hyperbahn client uses to log information about
advertisements

### `options.statsd`

A statsd client hyperbahn client uses to count information about
advertisement.

Counters:

 - `hyperbahn-client.{serviceName}.advertisement.success`
 - `hyperbahn-client.{serviceName}.advertisement.failure`

### `options.advertisementTimeout`

If set; hyperbahn client advertisemnt will timeout.

This defaults to 5000 if `hardFail` is `true` and defaults to
`Infinity` (no timeout) if `hardFail` is `false`.

### `options.hardFail`

The hyperbahnClient by default runs in a hybrid mode. This means
that `hardFail` is set to false and it will advertise() forever.

This is recommended for services that are both a HTTP server and
a tchannel server.

Any services that a pure tchannel server should set `hardFail`
to true. This means that if hyperbahnClient cannot advertise
after the `advertisementTimeout` (default 5 seconds) it will
emit an error event.

Not being able to advertise with hyperbahn is a fatal exception.

### `hyperbahnClient.advertise()`

You must call `advertise()` to start the advertisement loop with
the hyperbahn router. 

### `hyperbahnClient.getClientChannel(opts)`

You can call `getClientChannel()` to get the client sub channel
for a particular serviceName.

 - `opts.serviceName` the serviceName of the sub channel

This sub channel is pre-configured with the correct peers list
and callerName so you can make requests to it without configuring
it.

### `hyperbahnClient.once('advertised', listener)`

This event gets emitted every time hyperbahn router confirms your
advertisement. This means the hyperbahn router will start routing
requests to you.

Hyperbahn client will advertise every minute with the hyperbahn
routers. This event should get emitted every minute.

### `hyperbahnClient.once('error', listener)`

This event gets emitted if there's a failure with hyperbahn
advertisement. This only gets emitted if `hardFail` is `true`.
