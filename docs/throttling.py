"""
The following is a simulation to verify desirable properties of an algorithm
for determining which workers a Hyperbahn relay should connect to.
The ideal scenario would have similar numbers of relays and workers, with a
connection from each relay to each worker, times some multiple for redundancy.
However, the size of the relay set and worker set are both dynamic and
independent: they can be adjusted to balance their respective loads.
Although some scenarios will require a fully connected graph in service to
redundancy, the number of open connections should be otherwise minimized.
"""

import math
import sys

default_rps_limit = 9999999

# percentage to recover per second
recover_rate = 0
# number of request to recover per second
recover_value = 0

def current(start, time, style):
    """
    Given start value, 
          current time, and
          style,
    Return the current value
    The stype can be
        1) steady
        2) flappy
        3) linear_grow
        4) linear_decrease
        5) exponential_grow
        6) exponential_decrease
    """
    if style == 'steady':
        return start
    elif style == 'flappy':
        return start if time % 3 == 0 else 0
    elif style == 'linear_grow':
        return start + 100 * time
    elif style == 'linear_decrease':
        return start - 100 * time
    elif style == 'exponential_grow':
        return start * math.pow(2, x)
    elif style == 'exponential_decrease':
        return start / math.pow(2, x)
    else:
        raise Exception('wrong style!')

def current_rps(start, time, style):
    """
    Given current time and RPS style, return current RPS
    """
    return current(start, time, style)

def current_busy(start, time, style):
    """
    Given current time and busy response style, return current
    busy responses per second
    """
    return current(start, time, style)

def get_rps_limit(rps_limit, busy):
    limit = 0
    busy = 20 if busy > 20 else busy
    if recover_value > 0:
        limit = (rps_limit + recover_value) / math.pow(2, busy);
    elif recover_rate > 0:
        incr = rps_limit * recover_rate
        limit = (rps_limit + incr) / math.pow(2, busy);
    else:
        raise Exception('wrong recover_value || recover_rate!')

    limit = limit if limit <= default_rps_limit else default_rps_limit
    return limit


def run(start_rps, rps_style, start_busy, busy_style, duration):
    """
    Given start RPS,
          RPS style,
          start busy responses 
          busy response style, and
          the time duration,
    Simulate the throttling scenario.
        - Within the time duration, busy responses are active.
        - After the time duration, busy responses will drop to zero
          However, the simulation will continue until throttling is
          completely removed.
    """
    rps_limit = default_rps_limit
    prev_rps_limit = rps_limit
    rps = start_rps
    through_rps = rps
    throttled_rps = 0
    busy = start_busy

    print 'start rps=%d (%s) throttled=%d busy=%d (%s) limit=%d' % (through_rps, rps_style, throttled_rps, busy, busy_style, rps_limit)

    for time in range(1, duration):
        # calculate new RPS
        rps = current_rps(start_rps, time, rps_style)
        through_rps = rps if rps_limit > rps else rps_limit
        through_rps = math.floor(through_rps);
        throttled_rps = rps - through_rps

        # calculate new busy responeses
        busy = current_busy(start_busy, time, busy_style)
        busy = through_rps if busy > through_rps else busy

        # calculate new RPS limit
        prev_rps_limit = rps_limit
        rps_limit = get_rps_limit(rps_limit, busy);
        print '    --- time=%d rps=%d throttled=%d busy=%d limit=%d' % (time, through_rps, throttled_rps, busy, prev_rps_limit)

    print '    ++++ recovering'
    busy = 0
    time = duration
    threshold = 30
    while throttled_rps != 0:
        time += 1
        # calculate new RPS
        rps = current_rps(start_rps, time, rps_style)
        through_rps = rps if rps_limit > rps else rps_limit
        throttled_rps = rps - through_rps

        # calculate new RPS limit
        prev_rps_limit = rps_limit
        rps_limit = get_rps_limit(rps_limit, busy);
        print '    +++ time=%d rps=%d throttled=%d busy=%d limit=%d' % (time, through_rps, throttled_rps, busy, prev_rps_limit)
        if time > threshold:
            break;

    if time <= threshold:
        print '    converged at time=%d, speed=%d' % (time, time - duration)
    else:
        print '    failed to converge'

args = sys.argv

recover_value = 0
recover_rate = 3
print 'started with recover_rate: %d' % (recover_rate)
if (len(args) == 1 or args[1] == 'steady'):
    # start_rps = 5000, start_busy = 3000
    run(5000, 'steady', 3000, 'steady', 10)
elif (args[1] == 'flappy'):
    # start_rps = 5000, start_busy = 3000
    run(5000, 'steady', 3000, 'flappy', 10)
elif (args[1] == 'linear_grow'):
    # start_rps = 100, start_busy = 0
    run(100, 'linear_grow', 0, 'linear_grow', 10)
elif (args[1] == 'linear_decrease'):
    # start_rps = 5000, start_busy = 3000
    run(5000, 'linear_decrease', 3000, 'steady', 10)

recover_rate = 0
recover_value = 200
print 'started with recover_value: %d' % (recover_value)
if (len(args) == 1 or args[1] == 'steady'):
    # start_rps = 5000, start_busy = 3000
    run(5000, 'steady', 3000, 'steady', 10)
elif (args[1] == 'flappy'):
    # start_rps = 5000, start_busy = 3000
    run(5000, 'steady', 3000, 'flappy', 10)
elif (args[1] == 'linear_grow'):
    # start_rps = 100, start_busy = 0
    run(100, 'linear_grow', 0, 'linear_grow', 10)
elif (args[1] == 'linear_decrease'):
    # start_rps = 5000, start_busy = 3000
    run(5000, 'linear_decrease', 3000, 'steady', 10)











