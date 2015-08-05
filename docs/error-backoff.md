# Error Backoff

Error backoff is a mechanism that throttles outgoing TChannel traffic in order to improve the
health of the Hyperbahn cluster and its hosted services.


## Goals

Error backoff works passively to defend Hyperbahn cluster and services from flooding requests and retries.
It is very important that error backoff never affects healthy traffic.

Goals:

* Throttle out requests when busy frame is received.
* The throttling should grow if we have a growth in busy frames.
* The throttling should decline if the number of busy frames decline.
* Error backoff should converge. In other words, if the traffic stablizes in terms of failure/success
  ratios, the level of throttling should also be stable.
* No healthy traffic should be affected at any time. 

Non-goals:

* Error backoff doesn't do congestion control. [Rate Limiting](./rate-limiting.md) controls traffic and
  relieves the impact of congestions. In comparison, error backfoff reacts to rate limiting error frames
  in order to reduce the number of requests sent to the Hyperbahn cluster or even forwarded by the
  Hyperbahn cluster.
* Error backoff is not [Circuit Breaking](./circuit-breaking.md). When enabled on the client side, 
  error backoff throttles the requests sent by the client to the Hyperbahn cluster. When enabled
  on the Hyperbahn nodes, error backoff throttles the requests that can be forwarded through.


## Design & Implemenation

### Eligible errors

`tchannel.busy` is returned by Rate Limiting when one of the relaying nodes decides that the RPS limit for this
request has been reached. It can also be returned by the edge server when it has high event loop lag, RAM usage,
etc.


### Monitor 
Error backoff is specific to Hyperbahn edges, i.e., callerName ==> serviceName.

When an error is received, error backoff should take the error type and the frequency of the error into account.
Only eligible errors should be considered for backoff. The frequency of the error is used to
identify the change of the service quality such as degradation or recovery.

### Throttling
When a request should be throttled, error backoff returns `tchannel.busy` immediately rather than sending the request
out.


### Backoff mechanisms

#### Linear backoff
Linear backoff is a straightforward approach that throttles requests based on the number of error responses received.
Given a backoff rate of `R` and an eligible error count of `E`, linear backoff throttles the next `R * E` requests.
Linear backoff is simple to implement and easy to test. The recovery rate is linear as well. 

#### Exponential backoff
Exponential backoff is similar to linear backoff only except that the number of throttled requests is an exponential
function of `R * E`.

### Service alerts
Warning should be logged when a request is throttled by error backoff.


## Test plan
* Unit tests
* Integration tests in hyperbhan cluster
