# TChannel Traffic Metrics

This document defines a common set of traffic metrics that must be emitted by
the TChannel stack in each implementation language.  Metrics are defined as
names + set of required and optional tags containing additional context about
the specific event.  Metrics collections systems that do not support tags (such
as statsd or carbon) should translate the tag information into components
within a metric name hierarchy.

The metrics in this document are generic to any application-level peers; they
do not include metrics specific to the hyperbahn routing layer. 

### Relationship to Zipkin

Zipkin trace information can be used to derive timing information contained in
emitted metrics, but the metrics themselves do not contain span specific
information.  In a way, timing metrics can be viewed as a pre-aggregation of
request-specific timing information gathering within the process.  

### Relationship to Circuit Breaking

The same source events should be used to both emit metrics for graphing /
monitoring and gather statistics for circuit breaking, but the two are
independent systems and should have separate storage and data circulation
models.  

## Common Tags

All metrics MUST include the following tags:

  * ``app`` - the name/id of the application hosting the service or client.  TChannel
    metrics are arranged in a hierarchy - processes run one or more applications,
    applications host one or more services, services expose one or more endpoints,
    one application may be spread across multiple process.  The application name is
    considered to be a priori known to the TChannel stack, and is not dependent on
    any information coming in from the wire.  TChannel implementations should
    provide a way to pass the application name into whatever initialization
    functions they expose.

All metrics MAY include the following tags:
  * ``host`` - The name of the host on which the reporter is running.
  * ``cluster`` - Identifier of the cluster in which the reporter is running.  
    Differentiate nodes running in a canary vs full production vs private mode.
  * ``version`` - the version of the running application.  The version reported in 
    metrics should correlate to version information included in zipkin annotations 
    emitted by the process, to support correlating metrics data with dependency call graphs.

## Call Metrics

Call metrics track statistics about RPC calls made from or to the application.

### Outbound call metrics

Outbound call metrics measure calls made from the reporting process to a target
peer.  Call is defined as a call visible to application code - speculative
requests and retries are not included in outbound call metrics unless
specifically mentioned below.

All outbound call metrics MUST contain the ``service`` and ``target-service`` and
SHOULD contain a ``target-endpoint`` tag where reasonable.  The ``service`` tag is a
string indicating the name of the service initiating the call (the "cn
transport header"); the ``target-service`` tag is a string containing the name of
the service being called (the "service" field in the call request), and the
``target-endpoint`` tag is a string containing the id of the target endpoint being
invoked (from "arg1").  Implementations SHOULD only include the target endpoint
if the value space for the endpoint is finite; certain "as" transport - such as
HTTP-over-tchannel - contain UUIDs in their endpoints, making the value space
effectively infinite.  These implementations SHOULD omit the target-endpoint
tag or normalize the arg1 values to a finite set.

#### Counters 

##### outbound.calls.sent

The total number of calls initiated by this service to the target service/endpoint.

##### outbound.calls.success
The total number successful responses received from calls initiated by this
service to the target service/endpoint.

##### outbound.calls.system-errors
The total number of Error frame responses reported to the application from
calls initiated by this service to the target service/endpoint.  MUST include
an additional ``type`` tag indicating the type of error received; valid values are
the error code names described in the TChannel protocol doc.

##### outbound.calls.per-attempt.system-errors
The total number of Error frame responses per attempt (initial request or retry)
from calls initiated by this service to the target service/endpoint.  MUST include
an additional ``type`` tag indicating the type of error received; valid values are
the error code names described in the TChannel protocol doc.

##### outbound.calls.operational-errors
The total number of errors reported to the application whilst sending outgoing
calls initiated by this service to the target service/endpoint. These are not
error frames but actual local socket level errors or timeout errors. SHOULD
include an additional ``type`` tag indicating the type of error received;
standardizing operational error types is outside the scope of the core metrics.

##### outbound.calls.per-attempt.operational-errors
The total number of errors occured per attempt whilst sending outgoing
calls initiated by this service to the target service/endpoint. These are not
error frames but actual local socket level errors or timeout errors. SHOULD
include an additional ``type`` tag indicating the type of error received;
standardizing operational error types is outside the scope of the core metrics.

##### outbound.calls.app-errors

The total number of CallResponse/NotOk responses received from calls initiated
by this service to the the target service/endpoint.  MAY include an additional
``type`` tag indicating the type of application-level error received.
Standardization of application-level error types is outside the scope of the
core metrics.

##### outbound.calls.retries
The total number of retries performed by the sending service.  SHOULD include a
``retry-count`` tag indicating the per-request retry count represented by the
metric (e.g. the count of calls resulting in 1 retry should have retry-count=1,
the count of calls resulting in 2 retries should have retry-count=2, etc)

##### outbound.request.size
The total size in bytes of all requests sent to the target service/endpoint,
including framing information.

##### outbound.response.size
The total size in bytes of all non-error responses received by the target
service/endpoint including framing information.

#### Timers

##### outbound.calls.latency
End-to-end latency (measured in milliseconds) for calls sent by this service to
the target service/endpoint.  This is the application-perceived time that the
call took.  It is measured from the time the application initiated the request
to the time the final fragment is received and processed, and includes the
times for all retries.

##### outbound.calls.per-attempt.latency
Latency of an individual attempt (initial request or retry) at a call.
Measured from the time the first request fragment write is initiated to the
time the last response fragment read is received.  SHOULD include the peer tag
containing the host and port of the peer to whom the call attempt was sent.
SHOULD include a ``retry-count`` tag indicating the per-request retry count
represented by the metric (e.g. the first outgoing attempt should have 
``retry-count=0``, the second outgoing attempt should have ``retry-count=2`` etc)

### Inbound call metrics

Inbound call metrics measure calls received from a peer process.  All inbound
call metrics SHOULD contain the ``service``, ``endpoint``, and ``calling-service`` tags if
they are known at the point of emission.  The service and endpoint tags are
string indicating the name of the service and endpoint receiving the call; the
calling-service tag is a string indicating the name of the service that
initiated the call.  

#### Counters

##### inbound.calls.recvd
The total number of calls received by this service/endpoint.

##### inbound.calls.success
The total number successful responses generated by this service/endpoint.

##### inbound.calls.system-errors
The total number of Error responses generated from calls received by this
service/endpoint.  MUST include an additional ``type`` tag indicating the type of
error received, with values identical that described under
outbound.calls.system-errors

##### inbound.calls.app-errors
The total number of CallResponse/NotOk responses generated from calls received
by this service.  MAY include an additional ``type`` tag indicating the type of
application-level error received.  

##### inbound.cancels.requested
The total number of cancels received by the service / endpoint.

##### inbound.cancels.honored
The total number of cancels honored by the service / endpoint.  A cancel is
honored if causes a call to be discarded before being dispatched to the
application, or if the application abandons processing of the call as a result
of the cancel.

##### inbound.protocol-errors
The total number of protocol error messages generated by this application in response to a peer.  

##### inbound.request.size
The total size in bytes of all requests sent to the service/endpoint, including
framing information.

##### inbound.response.size
The total size in bytes of all non-error responses sent by the service/endpoint
including framing information.

#### Timers

##### inbound.calls.latency
Application latency (measured in milliseconds) for calls to the endpoint
handled by this service.  This is the application-perceived time that the call
took, measured from the time the request is handed to application code to the
time that the final response fragment is generated by application code.

### Connection Metrics

Connection metrics measure statistics related to socket connections initiated
or received by the process.  All connection metrics MUST contain the
``host-port`` and ``peer-host-port`` tags.  The ``host-port`` tag is a string
containing the host and port of the reporting process.  It MAY be 0.0.0.0:0 for
ephemeral clients.  The ``peer-host-port`` tag is a string containing the host
and port of the peer to whom connection is maintained.   

#### Gauges

##### connections.active
The number of currently active outbound connections from the process to the
peer.  Active connections are connections that may still be used to initiate or
receive traffic, and includes connections which might be in a state of graceful
shutdown.  

#### Counters
##### connections.initiated
The total number of connections initiated from this process to the target peer
over the process lifetime.

##### connections.connect-errors
The total number of errors that have occurred when this process has attempted
to initiate a connection to its peer.

##### connections.accepted
The total number of connections from the target peer accepted by this process
over its lifetime. 

##### connections.accept-errors
The total number of accept errors that have occurred on this process.

##### connections.errors
The total number of fatal connection-level errors that have occurred to
connections initiated between this process and the peer.  MUST include a ``type``
tag indicating the type of error.  Standard type tags include:

  * _network-error_ - the connection suffered a network level error (e.g. ECONNRESET)
  * _network-timeout_ - the connection received a network-level timeout during read/write 
  * _protocol-error_ - the peer responded with a message that violated the protocol 
  * _peer-protocol-error_ - the peer sent a protocol-error message in response to a message sent by this process

##### connections.closed

The total number of connections closed due to error or graceful shutdown (e.g.
idle timeouts, application initiated shutdown).  MAY include a ``reason`` tag
indicating the reason for the closure.  Standard reason tags include:

  * _idle-timeout_ - the connection was closed due to being idle beyond a timeout
  * _app-initiated_ - the connection was closed due to an application initiated close
  * _protocol-error_ - the connection was closed due to a protocol error
  * _network-error_ - the connection was closed due to a network level error 
  * _network-timeout_ - the connection was closed due to a network-level timeout
  * _peer-closed_ - the connection was closed by the peer

##### connections.bytes-sent

The total number of bytes sent across all connections maintained between this process and the peer.

##### connections.bytes-recvd

The total number of bytes received across all connections maintained between this process and the peer.



