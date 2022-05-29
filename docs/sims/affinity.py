"""
The following is a simulation to verify desirable properties of an algorithm
for determining which workers a Hyperbahn relay should connect to.
The ideal scenario would have similar numbers of relays and workers, with a
connection from each relay to each worker, times some multiple for redundancy.
However, the size of the relay set and worker set are both dynamic and
independent: they can be adjusted to balance their respective loads.
Although scenarios with either very few workers or very few relays will be
fully connected, the number of open connections should be otherwise minimal.
"""

from random import shuffle

def choose_peers(relay, relay_count, worker_count, min_w2r, min_r2w):
    """
    Given `relay`, the position of relay within the affinity set for a
    given service, the number of relays in that set (`relay_count`), the number
    of workers for the service (`worker_count`), the minimum number of
    connections required on each worker (`min_w2r`), and the minimum number of
    connections required for each relay node (`min_r2w`), compute the set of
    workers that the relay should connect to as positions in the worker set.
    """
    if relay_count == 0 or worker_count == 0:
        return set()
    ratio = float(worker_count) / relay_count
    start = int(relay * ratio)
    stop = int(relay * ratio + max(min_r2w, min_w2r * ratio) + 0.5)
    return set(worker % worker_count for worker in range(start, stop))

def choose_connection_graph(relay_count, worker_count, min_w2r, min_r2w):
    # w2r is the graph of edges from workers to relays
    # r2w is the graph of edges from relays to workers
    w2r = dict() # as a dict of sets
    r2w = dict()

    for relay in range(0, relay_count):
        for worker in choose_peers(
            relay, relay_count, worker_count, min_w2r, min_r2w
        ):
            w2r.setdefault(worker, set()).add(relay)
            r2w.setdefault(relay, set()).add(worker)

    return (w2r, r2w)

def avg(values):
    return float(sum(values)) / len(values)

def gammut():
    # Run various scenarios for combinations of the parameters and qualify the
    # results against our requirements.
    connectedness_stats = []
    for m in range(2, 7):
        for n in range(2, 7):
            for r in range(1, 100, 2):
                for w in range(1, 100, 2):
                    m = 2
                    w2rs, r2ws = choose_connection_graph(r, w, n, m)
                    w2r = set(len(nodes) for nodes in w2rs.values())
                    r2w = set(len(nodes) for nodes in r2ws.values())
                    tc = sum(len(nodes) for nodes in w2rs.values()) # total connections
                    connectedness_stats.append(tc / (r * w))
                    case = 'r=%d (m=%d) w=%d (n=%d) tc=%d (%d)' % (r, m, w, n, tc, r * w)

                    # There must always be some connections between relays and
                    # workers
                    if len(w2r) == 0:
                        print '%s no worker connections %r' % (case, w2rs)
                        break
                    elif len(r2w) == 0:
                        print '%s no relay connections %r' % (case, r2ws)
                        break

                    # Every worker should have the minimum number of connections
                    # per worker as stipulated by the "n" figure (or the number of
                    # relays if it is lower)
                    elif min(w2r) < min(n, r):
                        print '%s workers underconnected %r' % (case, w2rs)
                        break

                    # Every relay should have the minimum number of connections per
                    # relay as stipulated by the "m" figure (or the number of
                    # workers if it is lower)
                    elif min(r2w) < min(m, w):
                        print '%s relays underconnected %r' % (case, r2ws)
                        break

                    # A cluster should not be fully connected,
                    # unless the minimum number of connections from workers per
                    # worker or the minimum number of connections from relays per
                    # relay necessitates a fully connected network.
                    elif tc >= r * w and (n + 1) * w < tc and (m * 1) * r < tc:
                        print '%s too connected' % (case)

                    # Workers and relays should never have more connections than
                    # necessary, accounting for rounding error on both the upper
                    # and lower bound of their projected range.
                    elif max(w2r) > max(n, r) + 1:
                        print '%s workers overconnected %r' % (case, max(w2r))
                    elif max(r2w) > max(m, w) + 1:
                        print '%s relays overconnected %r' % (case, max(r2w))

                else:
                    continue
                break
    else:
        print '%0.1f%% connected on average' % (avg(connectedness_stats) * 100)

def run(scenario):
    # Simulate a scenario consisting of a sequence of relay and worker counts
    # and report peers added and removed on each relay for each step.
    min_w2r = 3
    min_r2w = 3
    previous = None
    for r, w in scenario:
        print '--- w=%d r=%d ---' % (w, r)
        _, current = choose_connection_graph(r, w, min_w2r, min_r2w)
        if previous is None:
            previous = current
            continue
        for relay, current_workers in current.items():
            previous_workers = previous.get(relay, set())
            gained = current_workers.difference(previous_workers)
            lost = previous_workers.difference(current_workers)
            if lost or gained:
                print '%d: %d +[%s] -[%s]' % (
                    relay,
                    len(current_workers),
                    ','.join('%d' % worker for worker in gained),
                    ','.join('%d' % worker for worker in lost)
                )
        previous = current
    print previous

def scaling_up_workers():
    r = 50
    for w in range(0, 100):
        yield r, w

def partition():
    yield (100, 100)
    yield (50, 100)

def startup(randomize=False):
    """
    This is a simulation of all workers for a given service starting up with a
    static set of relays.  Each worker starts and sends an advertisement to
    every relay, altering the set of affine workers.  Assuming that relays
    infrequently prune connections to workers that are no longer affine,
    this simulation illustrates that the first workers to start are connected
    to all of the relays, and each subsequent worker is less connected.

    When workers come online in order, the first workers are fully connected,
    and the number of connections for each subsequent worker diminishes
    linearly.

    When the order in which workers first advertise is random, the first
    workers are still fully connected, but each subsequent worker accumulates
    much fewer connections.
    """

    relay_count = 60
    min_w2r = 5
    min_r2w = 5
    worker_count = 1000

    workers = []
    worker_startup_order = list(range(worker_count))
    if randomize:
        shuffle(worker_startup_order)

    w2r_connections = dict((w, set()) for w in range(worker_count))

    # incrementally add workers to the pool of advertising workers
    for w in worker_startup_order:
        workers.append(w)
        workers.sort()
        # fan out advertisement to every relay
        for r in range(relay_count):
            # each relay connects to current peers
            peers = choose_peers(r, relay_count, len(workers), min_w2r, min_r2w)
            for peer_index in peers:
                p = workers[peer_index]
                w2r_connections[p].add(r)

    num_connections_by_worker = sorted(len(connections) for w, connections in w2r_connections.items())[::-1]
    for x in num_connections_by_worker:
        print x

print 'initialization'
run(scaling_up_workers())
print 'partition'
run(partition())
print 'verify gammut of simulations'
gammut()
print 'ordered startup'
startup()
print 'random order startup'
startup(randomize = True)
