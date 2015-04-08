# JSON over TChannel

This document outlines how we encode JSON over TChannel.

For JSON call requests the `as` (arg scheme) transport header
must be set to `json`. Requests will be made with `call req`
messages and responses will be sent using `call res` messages,
with values for `arg1`, `arg2` and `arg3` as defined in
[Arguments][].

For each `call req`, the service name (`service~1`) should be
set to the TChannel service being called.

For each `call res`, the response code (`code:1`) must be set
to `0x00` if the reponse was successful and the response code
must be set to `0x01` if the response was a failure.

## Arguments

For both `call req` and `call res`

 - `arg1` must be the method name as defined by [`arg1`][]
 - `arg2` must be the application headers encoded as JSON.
 - `arg3` must be the application response as defined by [`arg3`][]

### `arg1`

The method name must be a ascii string. It's recommended that
you use alphanumeric characters and `_`.

### `arg3`

`arg3` must be encoded as JSON.

For `call req` messages this is just an arbitary JSON payload.

For `call res` messages,

 - In the case of success, the response is an arbitrary JSON
    payload.
 - In the case of failures, the response is a JSON encoded
    error. It's recommended that errors have a `message` field
    that is a human readable string and a `type` field that's
    a static string identifying what type of error it is.


  [Arguments]: #arguments
  [`arg1`]: #arg1
  [`arg3`]: #arg3

