# Error Mapping between Tchannel and HTTP

## Stability: unstable

[![unstable](http://badges.github.io/stability-badges/dist/unstable.svg)](http://github.com/badges/stability-badges)

TChannel can return many different types of errors when making requests and
sending responses.

## TChannel client Errors

As part of http state machine integration, tchannel errors need be mapped to
proper http status codes/messages so that the client can differentiate errors
and possibly take some actions.

A list of tchannel errors defined at protocol level:
[section payloads.error.code `protocol.md`](protocol.md)

A list of http status code/message:
[http://www.w3.org/Protocols/rfc2616/rfc2616-sec10.html]

The proposed mapping is:

| code   | name                 | http status code/message
| ------ | -------------------- | -------------------------
| `0x01` | timeout              | 408 Request Timeout
| `0x02` | cancelled            | TBD
| `0x03` | busy                 | 503 Service Unavailable
| `0x04` | declined             | 403 Forbidden
| `0x05` | unexpected error     | 500 Internal Server Error
| `0x06` | bad request          | 400 Bad Request
| `0x07` | network error        | TBD
| `0x08` | unhealthy            | 503 Service Unavailable
| `0xFF` | fatal protocol error | TBD
