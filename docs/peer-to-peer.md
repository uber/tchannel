# Making peer to peer requests

TChannel is designed for interacting with a hyperbahn router.

The majority of the requests you make will be send directly
to the hyperbahn instances and will be routed based on the
`serviceName`

However tchannel can also be used to make peer to peer request
to individual tchannel instances

## `channel.waitForIdentified()`

## `channel.request({ host: ... })`
