"""
This simulation demonstrates that a cluster can rapidly converge on a shared
average and total for some distributed value by gossiping an aggregate value
and weight, and decaying the weight over time.

Each individual node initially predicts that its local value is representative
of the average value for every node in the cluster.
It eventually returns to this assumption if it is isolated from the rest of the
cluster.

Each gossip round, each node sends its aggregate value and weight statistics to
a random other node.
That node merges the gossiped value and weight into its own value and weight,
using the relative weights to strike a balance between assuming that the
cluster is homogenous (when little is know about the rest of the cluster) and
heterogenous (when information from the rest of the cluster is fresh and
complete).

The simulation has each node vary its local value with a random walk, with a
periodic reset to a random value.
The simulator reports the difference between the average aggregate value across
the cluster and the known actual average value.

The domain of possible actual values affects the rate of convergence after
disruption.
The size of the step during the random walk affects the variance in a steady
state.
"""

import math
import random
from itertools import count

size = 1000
rate = 0.5 / 400 / 10 # half life of 10 gossip rounds

class Node(object):
    def __init__(self, index, value, nodes):
        self.index = index
        self.nodes = nodes
        self.value = value
        # these are aggregate statistics
        # this is the approximate average value of this node across the entire
        # cluster.  the sum can be inferred by multiplying the average by the
        # membership size.
        self.ag_value = value
        # the weight is the number of individual nodes that contributed to the
        # average, with a bias for recently aggregated values determined by the
        # aggregate half life.
        self.ag_weight = 1
        # the time that these aggregates were computed, used to determine how
        # much to devalue the weight
        self.ag_since = 0
    def random_walk(self):
        # this function optionally adjusts the value once per gossip round so
        # we can observe how quickly the averages track the actual average
        # across the cluster.
        r = random.random()
        if r < .25:
            self.value = max(self.value - 1, 0)
        if r > .5:
            self.value = min(self.value + 1, 100)
    def random_reset(self):
        self.value = random.randint(0, 100)
    def gossip_out(self, nodes, now):
        # each round, a node choses a random other node to gossip to and sends
        # that node its aggregate value and weight.
        r = random.randint(0, len(nodes) - 1)
        # cap weight at cluster size
        ag_weight = min(len(nodes), self.ag_weight)
        nodes[r].gossip_in(self.ag_value, ag_weight, now)
    def gossip_in(self, value, weight, now):
        # the receipient of a gossip message adjusts the weight by age and
        # blends its own known value with the aggregate average, with a bias
        # for the aggregate value based on its weight.
        # we perform the weight adjustment on the receiving node to ensure that
        # the time computation compares apples to apples
        # diminish weight by age
        age = now - self.ag_since
        weight = weight * math.exp(rate * age)
        self.ag_value = (float(self.value) + (value * weight)) / (weight + 1)
        self.ag_since = now

nodes = []
for index in xrange(size):
    nodes.append(Node(index, 0, nodes))

for gossip_round in count(): #xrange(1000): # count():
    expected = sum(node.value for node in nodes)
    actual = sum(node.ag_value for node in nodes)
    if expected != 0:
        error = (actual - expected) / expected
        print '%+.2f%% error, %d real, %d average aggregate value' % (error *
            100, expected, actual)
    for node in nodes:
        # assuming 400ms gossip interval
        node.gossip_out(nodes, gossip_round * 400)
    for node in nodes:
        node.random_walk()
    # once in a while, set the value at each node to a random value so we can
    # observe how quickly the aggregate converges.
    if gossip_round % 500 == 0:
        print 'reset'
        for node in nodes:
            node.random_reset()
