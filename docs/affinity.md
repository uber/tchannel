
# Affinity

For every service, there is a set of service workers and a set of "affine"
(connected, related) Hyperbahn relays (the subset of the relay ring that is
responsible for traffic to and from the given service).
The minimum viable Hyperbahn fully connects relays to the affine workers,
however over time, the relays encroach upon their maximum file descriptor
limit.
The following is a strategy for determining which service workers each relay
should connect to.

There is a value *minPeersPerWorker* that is the number of connections each
service worker should retain to the Hyperbahn.
This number should never be less than 3 to ensure some measure of redundancy.
There is also a value *minPeersPerRelay* that is the minimum number of
connections each relay should maintain to workers to ensure redundancy.

There is a value *relayCount* that is the number of Hyperbahn relay
workers assigned to communicate with a given service.
This is approximately the *k* value for the service.

By virtue of gossiping advertisements for each service to every member of the
affinity set, every Hyperbahn relay knows the host and port of every worker for
its affine services.
*workerCount* is the number of workers for the service, and is known by every
affine relay.

Each relay within the affinity set for a service can know its position,
*relayIndex*, by finding itself within the sorted list of relays.

The affine relays can also consistently assign a position, *workerIndex*, to
each worker by sorting the workers.

Each position in the relay ring has a corresponding position projected linearly
onto the worker ring.
To project *relayIndex* to *workerIndex*:

    ratio = workerCount / relayCount

    workerIndex = relayIndex * ratio

The number of workers that each relay should connect to is *minPeersPerWorker*
scaled in proportion to the size of the affinity relay ring relative to the
number of workers.

    max( minPeersPerRelay, minPeersPerWorker * ratio )

In other words, it is the total number of connections expected among the
workers divided evenly among the relays.

    max(
        minPeersPerRelay,
        minPeersPerWorker * workerCount / relayCount
    )

Each relay should project its relative position within the worker set and then
connect to a range of workers to ensure the minimum number of connections
between each relay and worker.
This range starts at the corresponding position of the worker ring up to but
excluding the end of the range:

    workerIndex = round(
        relayIndex * ratio +
        max(
            minPeersPerRelay,
            minPeersPerWorker * ratio
        )
    )

One desirable property of this approach is that small changes to the affine
relay set or the worker set should largely overlap with the previous worker
set, retaining many existing connections.
However, small changes do impact the boundaries of every relay and may cause
adjustments throughout the system.

See [affinity.py](sims/affinity.py) for a simulation that verifies the static
properties of this peer selection algorithm for a spectrum of scenarios.
