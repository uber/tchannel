## Statsd

TChannel can emit the following stats:

## Stability: stable

[![stable](http://badges.github.io/stability-badges/dist/stable.svg)](http://github.com/badges/stability-badges)

### Counters

 - `outbound.calls.sent.{service}.{target-service}.{target-endpoint}`
 - `outbound.calls.success.{service}.{target-service}.{target-endpoint}`
 - `outbound.calls.system-errors.{service}.{target-service}.{target-endpoint}.{type}`
 - `outbound.calls.per-attempt.system-errors.{service}.{target-service}.{target-endpoint}.{type}.{retry-count}`
 - `outbound.calls.operational-errors.{service}.{target-service}.{target-endpoint}.{type}`
 - `outbound.calls.per-attempt.operational-errors.{service}.{target-service}.{target-endpoint}.{type}.{retry-count}`
 - `outbound.calls.app-errors.{service}.{target-service}.{target-endpoint}.{type}`
 - `outbound.calls.per-attempt.app-errors.{service}.{target-service}.{target-endpoint}.{type}.{retry-count}`
 - `outbound.calls.retries.{service}.{target-service}.{target-endpoint}.{retry-count}`
 - `outbound.request.size.{service}.{target-service}.{target-endpoint}`
 - `outbound.response.size.{service}.{target-service}.{target-endpoint}`
 - `inbound.calls.recvd.{calling-service}.{service}.{endpoint}`
 - `inbound.calls.success.{calling-service}.{service}.{endpoint}`
 - `inbound.calls.system-errors.{calling-service}.{service}.{endpoint}.{type}`
 - `inbound.calls.app-errors.{calling-service}.{service}.{endpoint}.{type}`
 - `inbound.request.size.{calling-service}.{service}.{endpoint}`
 - `inbound.response.size.{calling-service}.{service}.{endpoint}`
 - `connections.initiated.{peer-host}`
 - `connections.connect-errors.{peer-host}`
 - `connections.accepted.{peer-host}`
 - `connections.accept-errors.{host}`
 - `connections.errors.{peer-host}.{type}`
 - `connections.closed.{peer-host}.{reason}`
 - `rate-limiting.service-busy.{target-service}`
 - `rate-limiting.total-busy.{target-service}`

### Timers

 - `outbound.calls.latency.{service}.{target-service}.{target-endpoint}`
 - `outbound.calls.per-attempt-latency.{service}.{target-service}.{target-endpoint}.{retry-count}`
 - `inbound.calls.latency.{calling-service}.{service}.{endpoint}`

### Gauges

 - `connections.active.{peer-host}`
 - `rate-limiting.service-rps.{target-service}`
 - `rate-limiting.service-rps-limit.{target-service}`
 - `rate-limiting.total-rps`
 - `rate-limiting.total-rps-limit`
