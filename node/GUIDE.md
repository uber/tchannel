# Setting up a new node service with TChannel, Thrift & Hyperbahn

This guide will show you how to write a server and client.

The code matching this guide is [here](./examples/keyvalue/).

## Table of contents

  - [Dependencies](#dependencies)
  - [Defining your service](#defining-your-service)
  - [Writing a tchannel server](#writing-a-tchannel-server)
    - [Creating a tchannel](#creating-a-tchannel)
    - [Creating and registering your handlers](#creating-and-registering-your-handlers)
    - [Testing your server with tcurl](#testing-your-server-with-tcurl)
    - [Looking at your service with tcap](#looking-at-your-service-with-tcap)
    - [Setting up hyperbahn](#setting-up-hyperbahn)
    - [Registering with hyperbahn](#registering-with-hyperbahn)
    - [Testing against hyperbahn](#testing-against-hyperbahn)
  - [Writing a tchannel client](#writing-a-tchannel-client)
    - [Creating a tchannel](#creating-a-tchannel-1)
    - [Creating a hyperbahn client](#creating-a-hyperbahn-client)
    - [Making outgoing call requests using the tchannelThrift codec](#making-outgoing-call-requests-using-the-tchannelthrift-codec)
  - [Getting started with a real service](#getting-started-with-a-real-service)

## Dependencies

Make sure you have `node` and `npm` installed. To get started
create an empty project with `npm init` and run
`npm install tchannel --save`.

You will also need to run a Hyperbahn ring locally. How to setup
hyperbahn is out of scope for this document but hopefully you
can find instructions elsewhere.

## Defining your service

To define the interface of your service you can create a
[Thrift](https://thrift.apache.org) file.

Today we will use:

`keyvalue.thrift`:
```thrift
struct GetResult {
    1: string value
}

service KeyValue {
    GetResult get_v1(
        1: string key
    )
    void put_v1(
        1: string key,
        2: string value
    )
}
```

Our service will have two tchannel endpoints that can be accessed.
Namely `KeyValue::get_v1` and `KeyValue::put_v1`.

## Writing a tchannel server

To get a server up and running you need to do the following:

1. Create a TChannel and listen on a port
2. Configure your endpoint handlers using TChannelThrift
3. Create a hyperbahn client and advertise with hyperbahn

### Creating a tchannel

Create a tchannel using [`TChannel(opts)`](./docs/channel.md#var-channel--tchanneloptions) and listen to it by calling [`.listen(port, host)`](./docs/channel.md#channellistenport-host-callback).

It's advised that you listen on the external IP of your host to
ensure that other machines can create incoming connections to you.
Consider using [`my-local-ip`](https://github.com/dominictarr/my-local-ip) to determine your external IP.

When you create your channel make sure you configure the correct
options for your use cases. See the [tchannel docs](./docs/channel.md)
for more details.

```js
var TChannel = require('tchannel');
var myLocalIp = require('my-local-ip');

var rootChannel = TChannel();
rootChannel.listen(4040, myLocalIp());
```

### Creating and registering your handlers

To register your interface you must implement the `get` and `put`
endpoints on your tchannel.

First we create a sub channel using [`channel.makeSubChannel()`](./docs/sub-channels.md#channelmakesubchanneloptions).

Once we have a sub channel we have to create a [`TChannelThrift(opts)`](./docs/as-thrift.md#var-tchannelthrift--tchannelthriftops) codec.

Finally you can call [`.register()`](./docs/as-thrift.md#tchannelthriftregistertchannel-arg1-ctx-handlerfn) on the thrift
codec to register your actual endpoints.

```js
var TChannelThrift = rootChannel.TChannelAsThrift;

var keyChan = rootChannel.makeSubChannel({
    serviceName: 'keyvalue'
});
var keyThrift = TChannelThrift({
    source: fs.readFileSync('./keyvalue.thrift', 'utf8')
});
var ctx = {
    store: {}
};

keyThrift.register(keyChan, 'KeyValue::get_v1', ctx, get);
keyThrift.register(keyChan, 'KeyValue::put_v1', ctx, put);

function get(context, req, head, body, cb) {
    cb(null, {
        ok: true,
        body: {
            value: context.store[body.key]
        }
    });
}
function put(context, req, head, body, cb) {
    context.store[body.key] = body.value;
    cb(null, {
        ok: true,
        body: null
    });
}
```

### Testing your server with tcurl

You can test your server by making a call using
[tcurl](https://github.com/uber/tcurl)

To install tcurl, please run `npm install tcurl -g`

```sh
tcurl -p 127.0.0.1:4040 -t [DIR-TO-THRIFT] keyvalue KeyValue::put_v1 -3 '{"key":"hello","value":"world"}'
tcurl -p 127.0.0.1:4040 -t [DIR-TO-THRIFT] keyvalue KeyValue::get_v1 -3 '{"key":"hello"}'
```

Make sure you that you have a folder containing the thrift definition.
The thrift file should be called `keyvalue.thrift`.

### Looking at your service with tcap

You can see what's actually happening by using
[tcap](https:/github.com/uber/tcap) the tchannel network introspection tool.

To install tcap, please run `npm install tcap -g`

```sh
sudo tcap -p 4040 -i eth0 -i en0 -i lo -s keyvalue
tcurl -p 127.0.0.1:4040 -t [DIR-TO-THRIFT] keyvalue KeyValue::put_v1 -3 '{"key":"hello","value":"world"}'
```

### Setting up hyperbahn

You need to setup hyperbahn locally. Hopefully you have documentation
on how to set a local hyperbahn up.

### Registering with hyperbahn

Create a Hyperbahn client using [`HyperbahnClient(opts)`](./docs/hyperbahn.md#var-hyperbahnclient--hyperbahnclientoptions).

Call [`.advertise()`](./docs/hyperbahn.md#hyperbahnclientadvertise)
on the hyperbahn client to advertise your service with hyperbahn.

```js
var HyperbahnClient = require('tchannel/hyperbahn/');

var hyperbahnClient = HyperbahnClient({
    tchannel: rootChannel,
    serviceName: 'keyvalue',
    hostPortList: ['127.0.0.1:21301'],
    hardFail: true
});

hyperbahnClient.advertise();
hyperbahnClient.once('advertised', onAdvertised);

function onAdvertised() {
    /* hooray! */
}
```

### Testing against hyperbahn

Your service is now available on hyperbahn. You can test this by
making a call using [tcurl](https://github.com/uber/tcurl)

To install tcurl, please run `npm install tcurl -g`

```sh
tcurl -p [HYPERBAHN-HOSTPORT] -t [DIR-TO-THRIFT] keyvalue KeyValue::put_v1 -3 '{"key":"hello","value":"world"}'
tcurl -p [HYPERBAHN-HOSTPORT] -t [DIR-TO-THRIFT] keyvalue KeyValue::get_v1 -3 '{"key":"hello"}'
```

Make sure to replace `[HYPERBAHN-HOSTPORT]` with one of the
hyperbahn instance host ports and `[DIR-TO-THRIFT]` with a folder
where the thrift files are stored.

Your service can be accessed over Hyperbahn + TChannel from any
language.

You can also see the traffic flowing through hyperbahn using
tcap

```sh
sudo tcap -p 21301 -i lo
```

## Writing a tchannel client

To make a client that talks to hyperbhan, you need to:

 - Create a tchannel
 - Create a hyperbahn client
 - Making outgoing call requests using TChannelThrift codec

### Creating a tchannel

TChannel is a bidirectional RPC library; you already know how
to create a root channel.

A pure client does not need to call `.listen()` but it's
recommended that you `.listen()` anyway and `advertise()` anyway.
It's always best to get onto the hyperbahn as early as possible.

Feel free to re-use the `rootChannel` that you made for the server

### Creating a hyperbahn client

The hyperbahn client is bidirectional. You already know how to
create a hyperbahn client.

Technically you do not need to `advertise()` as a pure client but
it's recommended that you do so.

Feel free to re-use the `hyperbahnClient` that you made for the server

### Making outgoing call requests using the tchannelThrift codec

To make an outgoing call request you will need a sub channel
for the service you are talking to. Use
[`hyperbahnClient.getClientChannel(opts)`](./docs/hyperbahn.md#hyperbahnclientgetclientchannelopts) to get a sub channel

Once you have a subchannel you can create a thrift codec using
[`TChannelThrift(opts)`](./docs/as-thrift.md#var-tchannelthrift--tchannelthriftopts)

Finally we call [`.request()`](./docs/as-thrift.md#tchannelthriftrequestreqoptssendendpoint-head-body-cb)
on the thrift codec.

```js
var hyperbahnClient = HyperbahnClient({
    tchannel: rootChannel,
    serviceName: 'keyvalue-client',
    hostPortList: ['127.0.0.1:21301'],
    hardFail: true
});

var keyChan = hyperbahnClient.getClientChannel({
    serviceName: 'keyvalue'
});
var keyThrift = rootChannel.TChannelAsThrift({
    source: fs.readFileSync('./keyvalue.thrift', 'utf8'),
    channel: keyChan
});

keyThrift.request({
    serviceName: 'keyvalue',
    timeout: 100
}).send('KeyValue::put_v1', null, {
    key: 'hello',
    value: 'world'
}, function onResponse(err, resp) {
    if (err) {
        return logger.error('got an error', {
            error: err
        });
    }

    logger.info('got result', {
        ok: resp.ok,
        body: resp.body
    });
});
```

## Getting started with a real service

Now that you've followed the guide it's recommended that you 
use the scaffolder for getting a real service up and running.

You can https://github.com/Raynos/tchannel-gen to scaffold out
a new service and this will include all of the bootstrapping,
ringpop and testing infrastructure as well as example tests.
