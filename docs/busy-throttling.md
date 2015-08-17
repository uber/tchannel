# Throttling on Busy Responses

In TChannel, a busy response is sent to indicate that a service is overloaded. Upon
receiving busy responses, the client should reduce its requests to the service so
that the service can recover to a healthy state.

## Goals
There are three goals we want to achieve:

* When a busy response is received, we want to exponentially reduce the outgoing requests
  to the service.
* The longer the busy responses are received, the longer it should take to recover the outgoing
  requests. This is to reduce the flappy scenarios where the service is back and forth in good
  and bad states.
* When there is no busy reponses and the service is back to healthy. Traffic should not take too
  long to recover.


## Design

In order to do throttling, it is necessary to measure how fast the client is sending
the requests. We use RPS (Request Per Second), i.e., the number of request sent every
second. Given the client `clientA` that sends requests to the sevice `serviceB` with a
RPS of `RpsToB` and a RPS limit of `RpsLimitToB`, there are three scenairos that we
care about:

1. All requests responeded without any busy responses. In this case, no request
   should be throttled. `clientA` should continue to send all requests to `serviceB`. 
2. If a busy response is received, `clientA` should throttle its sent requests to `serviceB`.
   We use an exponential throttling rate, i.e., for every busy response received,
   we set the RPS limit `RpsLimitToB` to `RpsToB / 2`. This will
   actively cut down half of the request volume from `clientA` to `serviceB`.
3. When requests to `serviceB` is under throttling, there should be a gradual increase
   of the RPS limit to allow some requests coming through. Based on the simulation, we
   set the recover rate as 3, i.e., for every second, we set `RpsLimitToB` = `RpsLimitToB * 3` .

For throttling on busy responses, it is important that normal traffic is not affected. When
there is a busy response, requests will get throttled in an exponential rate. On the other 
hand, the recover rate makes sure that the throttling condition can be gradually lifted when
the service's throughput is improved.  

## Simulation
We use a simulation program to validate the design. The program simulates time as a incremental counter of
seconds. For each second, there will be a customizable amout of out requests and busy responses. It is 
important to make sure that the number of busy responses never exceeds the number of actual out requests.

First, We let the simulation run for 10 seconds (i.e., 10 increment of time counter) with various traffic
patterns including busy responses. Then, we turn off the busy responses to let the traffic recover. If the
traffic doesn't recover withn the next 20 seconds, we claim that the traffic failed to converge.

Below, we will discuss two typical traffic patterns. There are more patterns supported by the simulation program.
Also, we compare the proposed design with a slightly modified version where the recover value is a constant (200),
i.e., `RpsLimitToB` = `RpsLimitToB + 200`

### Pattern "Steady", with a starting RPS of 5000 and a maximum number of busy responses of 3000
From the comparison, it is easy to infer that the proposed approach has two clear advantages: 1) when there are busy
responses, there is no flappy traffic. The out requests are throttled well as it is supposed to be. 2) the recover is much
faster when there is no busy response.

```
python throttling.py steady
started with recover_rate: 3
start rps=5000 (steady) throttled=0 busy=3000 (steady) limit=9999999
    --- time=1 rps=5000 throttled=0 busy=3000 limit=9999999
    --- time=2 rps=38 throttled=4962 busy=38 limit=38
    --- time=3 rps=0 throttled=5000 busy=0 limit=0
    --- time=4 rps=0 throttled=5000 busy=0 limit=0
    --- time=5 rps=0 throttled=5000 busy=0 limit=0
    --- time=6 rps=0 throttled=5000 busy=0 limit=0
    --- time=7 rps=0 throttled=5000 busy=0 limit=0
    --- time=8 rps=0 throttled=5000 busy=0 limit=0
    --- time=9 rps=0 throttled=5000 busy=0 limit=0
    ++++ recovering
    +++ time=11 rps=2 throttled=4997 busy=0 limit=2
    +++ time=12 rps=9 throttled=4990 busy=0 limit=9
    +++ time=13 rps=38 throttled=4961 busy=0 limit=38
    +++ time=14 rps=152 throttled=4847 busy=0 limit=152
    +++ time=15 rps=610 throttled=4389 busy=0 limit=610
    +++ time=16 rps=2441 throttled=2558 busy=0 limit=2441
    +++ time=17 rps=5000 throttled=0 busy=0 limit=9765
    converged at time=17, speed=7
started with recover_value: 200
start rps=5000 (steady) throttled=0 busy=3000 (steady) limit=9999999
    --- time=1 rps=5000 throttled=0 busy=3000 limit=9999999
    --- time=2 rps=9 throttled=4991 busy=9 limit=9
    --- time=3 rps=0 throttled=5000 busy=0 limit=0
    --- time=4 rps=200 throttled=4800 busy=200 limit=200  <=== flappy traffic
    --- time=5 rps=0 throttled=5000 busy=0 limit=0
    --- time=6 rps=200 throttled=4800 busy=200 limit=200  <=== flappy traffic
    --- time=7 rps=0 throttled=5000 busy=0 limit=0
    --- time=8 rps=200 throttled=4800 busy=200 limit=200  <=== flappy traffic
    --- time=9 rps=0 throttled=5000 busy=0 limit=0
    ++++ recovering
    +++ time=11 rps=200 throttled=4799 busy=0 limit=200
    +++ time=12 rps=400 throttled=4599 busy=0 limit=400
    +++ time=13 rps=600 throttled=4399 busy=0 limit=600
    +++ time=14 rps=800 throttled=4199 busy=0 limit=800
    +++ time=15 rps=1000 throttled=3999 busy=0 limit=1000
    +++ time=16 rps=1200 throttled=3799 busy=0 limit=1200
    +++ time=17 rps=1400 throttled=3599 busy=0 limit=1400
    +++ time=18 rps=1600 throttled=3399 busy=0 limit=1600
    +++ time=19 rps=1800 throttled=3199 busy=0 limit=1800
    +++ time=20 rps=2000 throttled=2999 busy=0 limit=2000
    +++ time=21 rps=2200 throttled=2799 busy=0 limit=2200
    +++ time=22 rps=2400 throttled=2599 busy=0 limit=2400
    +++ time=23 rps=2600 throttled=2399 busy=0 limit=2600
    +++ time=24 rps=2800 throttled=2199 busy=0 limit=2800
    +++ time=25 rps=3000 throttled=1999 busy=0 limit=3000
    +++ time=26 rps=3200 throttled=1799 busy=0 limit=3200
    +++ time=27 rps=3400 throttled=1599 busy=0 limit=3400
    +++ time=28 rps=3600 throttled=1399 busy=0 limit=3600
    +++ time=29 rps=3800 throttled=1199 busy=0 limit=3800
    +++ time=30 rps=4000 throttled=999 busy=0 limit=4000
    +++ time=31 rps=4200 throttled=799 busy=0 limit=4200
    failed to converge
```

### Pattern "Flappy", with a starting RPS of 5000 and a maximum number of busy responses of 3000
In this pattern, the busy responses come every 3 seconds. It simulates a flappy network scenario where the
service quality gets good and bad. From the comparison, it is easy to infer that constant recover values
don't handle the flappy scenario well, nor can it converge when the network gets better.

```
python throttling.py flappy
started with recover_rate: 3
start rps=5000 (steady) throttled=0 busy=3000 (flappy) limit=9999999
    --- time=1 rps=5000 throttled=0 busy=0 limit=9999999
    --- time=2 rps=5000 throttled=0 busy=0 limit=9999999
    --- time=3 rps=5000 throttled=0 busy=3000 limit=9999999
    --- time=4 rps=38 throttled=4962 busy=0 limit=38
    --- time=5 rps=152 throttled=4848 busy=0 limit=152
    --- time=6 rps=610 throttled=4390 busy=610 limit=610
    --- time=7 rps=0 throttled=5000 busy=0 limit=0
    --- time=8 rps=0 throttled=5000 busy=0 limit=0
    --- time=9 rps=0 throttled=5000 busy=0 limit=0
    ++++ recovering
    +++ time=11 rps=0 throttled=4999 busy=0 limit=0
    +++ time=12 rps=0 throttled=4999 busy=0 limit=0
    +++ time=13 rps=2 throttled=4997 busy=0 limit=2
    +++ time=14 rps=9 throttled=4990 busy=0 limit=9
    +++ time=15 rps=38 throttled=4961 busy=0 limit=38
    +++ time=16 rps=152 throttled=4847 busy=0 limit=152
    +++ time=17 rps=610 throttled=4389 busy=0 limit=610
    +++ time=18 rps=2441 throttled=2558 busy=0 limit=2441
    +++ time=19 rps=5000 throttled=0 busy=0 limit=9765
    converged at time=19, speed=9
started with recover_value: 200
start rps=5000 (steady) throttled=0 busy=3000 (flappy) limit=9999999
    --- time=1 rps=5000 throttled=0 busy=0 limit=9999999
    --- time=2 rps=5000 throttled=0 busy=0 limit=9999999
    --- time=3 rps=5000 throttled=0 busy=3000 limit=9999999
    --- time=4 rps=9 throttled=4991 busy=0 limit=9
    --- time=5 rps=209 throttled=4791 busy=0 limit=209
    --- time=6 rps=409 throttled=4591 busy=409 limit=409
    --- time=7 rps=0 throttled=5000 busy=0 limit=0
    --- time=8 rps=200 throttled=4800 busy=0 limit=200
    --- time=9 rps=400 throttled=4600 busy=400 limit=400
    ++++ recovering
    +++ time=11 rps=0 throttled=4999 busy=0 limit=0
    +++ time=12 rps=200 throttled=4799 busy=0 limit=200
    +++ time=13 rps=400 throttled=4599 busy=0 limit=400
    +++ time=14 rps=600 throttled=4399 busy=0 limit=600
    +++ time=15 rps=800 throttled=4199 busy=0 limit=800
    +++ time=16 rps=1000 throttled=3999 busy=0 limit=1000
    +++ time=17 rps=1200 throttled=3799 busy=0 limit=1200
    +++ time=18 rps=1400 throttled=3599 busy=0 limit=1400
    +++ time=19 rps=1600 throttled=3399 busy=0 limit=1600
    +++ time=20 rps=1800 throttled=3199 busy=0 limit=1800
    +++ time=21 rps=2000 throttled=2999 busy=0 limit=2000
    +++ time=22 rps=2200 throttled=2799 busy=0 limit=2200
    +++ time=23 rps=2400 throttled=2599 busy=0 limit=2400
    +++ time=24 rps=2600 throttled=2399 busy=0 limit=2600
    +++ time=25 rps=2800 throttled=2199 busy=0 limit=2800
    +++ time=26 rps=3000 throttled=1999 busy=0 limit=3000
    +++ time=27 rps=3200 throttled=1799 busy=0 limit=3200
    +++ time=28 rps=3400 throttled=1599 busy=0 limit=3400
    +++ time=29 rps=3600 throttled=1399 busy=0 limit=3600
    +++ time=30 rps=3800 throttled=1199 busy=0 limit=3800
    +++ time=31 rps=4000 throttled=999 busy=0 limit=4000
    failed to converge
```




