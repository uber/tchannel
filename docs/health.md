
# Instance tracking for health checks

To facilitate health checks to named workers through Hyperbahn, workers may
advertise both the service name (e.g., `tcollector`) and a instance name (e.g.,
`tcollector01-1-dc1`).
The advertisement is broadcast to every affine Hyperbahn relay for that
service.

With partial affinity, each relay is responsible for a proportional subset of
the advertising service workers.
Relays determine the relay responsible for a worker by sorting the known relay
and worker lists and projecting an index from one to the other.

Every affine relay tracks an additional mapping from worker host:port to the
last known worker identifier.

Requests may have an additional `in` (instance name) transport header.
Egress relays respect the `in` by forwarding to a relay responsible for
maintaining an open connection.
When a relay receives a request:

1. If the relay is not an exit node for `sn` (service name), forwards to one
that is.
2. Looks up the host:port for the instance name (instance address).
3. Using the known relays and known workers, discerns the set of host:port for
relays responsible for connections to the instance address (instance relays).
4. If the relay is not among instance relays, forwards to one that is.
5. Forwards the request to the instance address.

