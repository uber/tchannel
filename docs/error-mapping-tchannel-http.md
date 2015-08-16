# Error Mapping between TChannel and HTTP

## Stability: unstable

[![unstable](http://badges.github.io/stability-badges/dist/unstable.svg)](http://github.com/badges/stability-badges)

TChannel can return many different types of errors when making requests and
sending responses.

## TChannel Client Errors

As part of http state machine integration, tchannel errors need be mapped to
proper http status codes/messages so that http clients can differentiate errors
and possibly take some actions.

A list of tchannel errors defined at protocol level:
[section payloads.error.code `protocol.md`](protocol.md)

A list of http status code/message:
[https://en.wikipedia.org/wiki/List_of_HTTP_status_codes]

The proposed mapping is:

| code   | name                 | http status code/message
| ------ | -------------------- | -------------------------
| `0x01` | timeout              | 504 Gateway Timeout
| `0x02` | cancelled            | 500 TChannel Cancelled
| `0x03` | busy                 | 429 Too Many Requests
| `0x04` | declined             | 503 Service Unavailable
| `0x05` | unexpected error     | 500 Internal Server Error
| `0x06` | bad request          | 400 Bad Request
| `0x07` | network error        | 500 TChannel Network Error
| `0x08` | unhealthy            | 503 Service Unavailable
| `0xFF` | fatal protocol error | 500 TChannel Protocol Error
