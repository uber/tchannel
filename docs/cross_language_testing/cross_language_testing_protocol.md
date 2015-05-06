# TChannel Cross Language Testing Protocol

This document lays out a standerd set of serivecs / endpoints that each
language needs to implement to participate in the testing suite.

## Test Server Requirements

The TChannel introspection API will play a key role in the testing suite.

However being a read-only API more is needed, to that end we define:
- a control API that allows the test suite to open/close connections on the
  remote server
- a simple raw echo service
- a simple key-value store json service
- a simple key-value store thrift service
- an optional http service

### `service=test_control` endpoints

#### `close_connections`

- transport header `as=raw`
- request
  - arg2: utf-8 string, service name to celar peers for, may be empty
  - arg3: empty
- response
  - arg2: echo back the request arg2
  - arg3: utf-8 string, new-line delimited list of connections which were closed

If this request would close the incoming connection that it is on, then it MUST
do so AFTER ok response has been sent.

#### `clear_peers`

- transport header `as=raw`
- request
  - arg2: utf-8 string, service name to celar peers for, may be empty
  - arg3: empty
- response
  - arg2: echo back the request arg2
  - arg3: utf-8 string, new-line delimited list of peers which were cleared

If this request would close the incoming connection that it is on, then it MUST
do so AFTER ok response has been sent.

#### `add_peer`

- transport header `as=raw`
- request
  - arg2: utf-8 string, service name to add the peers for, may be empty
  - arg3: utf-8 string, new-line delimited list of `host:port`
- response
  - arg2: echo back the request arg2
  - arg3: same form as request arg3, but only containing the peers that were
    actually newly added

This request merely adds peering information, but the implementing service MUST
not connect immediately to the peer.  If the peer already exists and already
has connections, they are undisturbed.

#### `connect_to`

- transport header `as=raw`
- request
  - arg2: empty
  - arg3: utf-8 string, a single `host:port` string
- response
  - arg2: empty
  - arg3: JSON encoded init response data

This request should create a _new_ outgoing connection, even if one already
exists, to the specified `host:port`.

This new connection MAY be used in preference to all other (if any)
pre-existing outgoing connections for sending calls to the given peer, however
such connections MUST NOT be closed if they exist.

The handler MUST wait for the outgoing connection to finish an init req/res
cycle, and return the received init res data in the response arg3.

The handler MUST use streaming mode for its response, and MUST send the
arg1/arg2 data immediately after creating the connection before waiting for
init cycle completion.

Any error that occurs while creating the connection, or on it during init cycle
MUST be returned as the string message of an `UnexpectedError` error frame.

### `service=test_as_raw`, `as=raw` endpoints

#### `echo`

#### `streaming_echo`

### `service=test_kv_as_json`, `as=json` endpoints

#### `echo`

#### `streaming_echo` (optional, `as=ldjson` streamed)

#### `list`

#### `get`

#### `set`

#### `del`

#### `watch` (optional, `as=ldjson` streamed)

### `service=test_kv_as_thrift`, `as=thrift` endpoints

#### `echo`

#### `streaming_echo` (experimental, streamed thrift)

#### `list`

#### `get`

#### `set`

#### `del`

#### `watch` (experimental, streamed thrift)

### `service=test_as_http`, `as=http` endpoints
