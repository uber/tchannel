# Error Backoff

Error backoff is a mechanism that throttles outgoing TChannel traffic in order to improve the
health of the Hyperbahn cluster and its hosted services. By definition, error backoff monitors
the status of outgoing TChannel traffic. If it determines that 1) the Hyperbahn cluster/services
are unhealthy, and 2) the unheathy state can be improved by throttling outgoing
traffic, error backoff will effectively throttle outgoing traffic by returning error responses
corresponding to the out requests.

There are many reasons why error backoff can help. For example, when responding to `tchannel.busy`,
it means that a service is stressed so that requests to the service should be reduced. As another
example, when `tchannel.declined` is received, it may indicate the absence of any healthy host
for the service, so there is no reason to send more requests to the same service in the next short
amount of time period.


## Goals

Error backoff works passively to defend Hyperbahn cluster and services from flooding requests and retries.
When a service is unhealth or over stressed, there will be an increasing number of error responses.
Such an unhealthy state should be handled by reducing the requests to the service. On the other hand,
it is very important that error backoff never affects healthy traffic.

Goals:

* Monitor the health state of an Hyperbahn edge, i.e., callerName ==> serviceName. Most effectively,
  such information should be observed locally through call responses.
* Throttle out requests if the current unheathy state can be relieved by reducing the requests.
* The throttling should grow if the health state continues to decline.
* The throttling should decline if the health state improves.
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

### Errors sensitive to backoff 
Only issues that can be relieved by throttling should be considered for error backoff. Errors sensitive to
backoff are also called eligible errors. There are three types of eligible errors handled by error backoff. 

`tchannel.timeout` is received when a request is not completed within its timeout limit. The error indicates
that the Hyerbahn cluster and/or the service is becoming slow.

`tchannel.busy` is returned by Rate Limiting when one of the relaying nodes decides that the RPS limit for this
request has been reached.

`tchannel.declined` is returned when 1) there is no peer available for this service or 2) the request is declined
by Circuit Breaking. 


### Health monitor 
Error backoff is specific to Hyperbahn edges, i.e., callerName ==> serviceName. Therefore, the measurement of
traffic health is associated with the edges.

When an error is received, error backoff should take the error type and the frequency of the error into account.
Only eligible errors should be considered towarding an unhealthy state. The frequency of the error is used to
identify the change of the service quality such as degradation or recovery. In other words, the more errors received,
the unhealthier the service is considered.


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
