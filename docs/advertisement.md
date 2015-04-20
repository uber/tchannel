# TChannel advertisement

TChannel advertisement is an addendum to the TChannel protocol.
The advertisement document defines a couple of new frame types
used to advertise the availability of service names.

## Message flow

There are two workflows for advertisement; one is for advertising
to a hyperbahn routing service and the other is for general
advertisement between peer to peer tchannel servers.

### Advertising to a hyperbahn routing service

A service X sends an `advertise` frame to a hyperbahn routing
service. It tells it what services it has available at what
costs.

The hyperbahn routing service will internally assign
a set of egress affinity routing instances that are responsible
for the advertised services. It will send a `relay-advertise`
frame to each egress affinity routing instance.

The hyperbahn routing instance that got the `advertise`
message will respond with a `forward-advertise` message indicating
that it will forward traffic to service X. It will inform service
X how many connections for forwarding it should expect.

### Advertising to a peer

A tchannel server X can send an `advertise` frame to a tchannel
server Y. It will advertise what services it has available
at what costs.

## Frames

### Payload: advertise (0x20)

Schema:
```
tracing:25 num:2 ( service~1 cost:1 ){num}
```

An advertise message means that the remote connection has 
the advertised services available at the advertised cost.

The tchannel server receiving the advertise message knows that
it can send a call request down the connection for any of the
advertised services and they will be received.

When a tchannel server receives an `advertise` message, it may:

  - send a `relay-advertise` message to other tchannel servers
  - send a `forward-advertise` message back to the server that
    advertised.

It is valid to `advertise` multiple times down the same connection

### Payload: relay-advertise (0x21)

Schema:
```
tracing:25 num:2 ( service~1 hostport~1 cost:1 ){num}
```

The `hostport` field is a string defined as "host:port"

A `relay-advertise` message indicates that the following 
hostports have services available at a certain cost.

This means that if the tchannel server that receives the 
`relay-advertise` message were to connect directly to the
hostport it would be able to send call requests for the service
and know that it gets delivered with the cost.

### Payload: forward-advertise (0x22)

Schema:
```
tracing:25 conncount:2
```

A `forward-advertise` message is a response to an `advertise`
message. It means that the remote intents to forward messages
to you for the advertised services and will use a `conncount`
number of connections to do so.

A `forward-advertise` can only be received after you've send
out an `advertise` message.
