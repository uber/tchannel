# Throttling on Busy Responses

In TChannel, a busy response is sent to indicate that a service is overloaded. Upon
receiving busy responses, the client should reduce its requests to the service so
that the service can recover to a healthy state.

In order to do throttling, it is necessary to measure how fast the client is sending
the requests. We use RPS (Request Per Second), i.e., the number of request sent every
second. Given the client `clientA` that sends requests to the sevice `serviceB` with a
RPS of `RpsToB`, there are three scenairos that we care about:

1. All requests responeded without any busy responses. In this case, no request
   should be throttled. `clientA` should continue to send all requests to `serviceB`. 
2. If a busy response is received, `clientA` should throttle its sent requests to `serviceB`.
   We use an exponential throttling rate, i.e., for every busy response received,
   we set the RPS limit to `RpsToB / 2`. This will
   actively cut down half of the request volume from `clientA` to `serviceB`.
3. When requests to `serviceB` is under throttling, there should be a gradual increase
   of the RPS limit to allow some requests coming through. Such a recover rate should
   be linear. For example, the RPS limit can increase at a 5% rate per second.

For throttling on busy responses, it is important that normal traffic is not affected. When
there is a busy response, requests will get throttled in an exponential rate. On the other 
hand, the recover rate makes sure that the throttling condition can be gradually lifted when
the service's throughput is improved.  

