# HTTP over TChannel

This document outlines how we encode HTTP over TChannel.

For HTTP call requests the `as` (arg scheme) transport header must be set to
`http`. Requests will be made with `call req` messages and responses will be
sent using `call res` messages, with values for `arg1`, `arg2` and `arg3` as
defined below.

The HTTP arg scheme does not support dispatch on `arg1`, all dispatching
decisions must be made on the `service` field.

## Arguments

- `arg1` is an arbitrary circuit string, which can be left empty
- `arg2` is encoded request/response meta data detailed below
- `arg3` is a raw byte stream piped through from the http request/response

### `arg2`: request meta data

Binary schema:
```
method~1
url~2
numHeaders:2 (headerName~2 headerValue~2){numHeaders}
```

### `arg2`: response meta data

Binary schema:
```
statusCode:2
message~2
numHeaders:2 (headerName~2 headerValue~2){numHeaders}
```

Notes:
- statusCode is the HTTP status code
- message is utf-8 encoded
- the headers section is to be implemented as a multi-map, or list of
  pairs; a single-valued map is insufficient
