# TChannel v2

## Design goals

- Easy to implement in multiple languages, especially JS and Python
- High performance forwarding path. Intermediaries can make a forwarding
  decision quickly.
- Request / response model with out of order responses. Slow requests will not
  block subsequent faster requests at head of line.
- Large requests/responses may/must be broken into fragments to be sent
  progressively.
- Optional checksums
- Can be used to transport multiple protocols between endpoints, e.g. HTTP+JSON
  and Thrift.

## Why not finagle-mux?

The Finagle system developed by Twitter was a big inspiration for this
protocol, specifically finagle-mux. However, there are several additional
features we want out of this system that will require changes. Also, there is
only one implementation of finagle-mux, which is in Scala. At Uber we'll need
to implement at least a node and python version of this protocol, and a Go and
JVM version are likely to follow after.

## Field Length Conventions

In this document, all numeric values are unsigned and in big-endian byte order.
All strings are UTF-8. All keys and values used in headers are strings.

The schema for describing field lengths and counts is the same as finagle-mux:

- the schema `size:4 body:10` defines the field `size` to be 4 bytes, followed
  by 10 bytes of the field `body`.
- the schema `key~4` defines the field `key` to be 4 bytes of a size, followed
  by that many bytes of data.
- `key~4` is shorthand for `keysize:4 key:keysize`

Groups are denoted by parentheses. A group's repetition count is either {\*} for
0 or more repetitions, or {n} for exactly n repetitions.

## Message Flow

Tchannel is a bi-directional request/response protocol. Each connection between
peers is considered equivalent, regardless of which side initiated it. It's
possible, perhaps even desirable, to have multiple connections between the same
pair of peers. Message ids are scoped to a connection. It is not valid to send
a request down one connection and a response down another. It is certainly
possible to send one request down one connection and then a subsequent request
down another, for whatever reason you might have.

Initiating a new connection works like this:

1. node A initiates TCP connection to node B
2. B accepts TCP, must not send any data until receiving "init req"
3. A sends "init req" with desired version, must not send any data until
   receiving "init res"
4. B sends "init res", with selected version V. B may now send requests with
   version V.
5. A receives "init res". A may now send requests with version V.

Each message is encapsulated in a frame with some additional information that
is common across all message types. Part of that framing information is an id.
This id is chosen by the requestor when sending a request message. When
responding to a request, the responding node uses the message id in the request
frame for the response.

Each frame has a type which describes the format of the frame's body. Depending
on the frame type, some bodies are 0 bytes.

The "call req" frame type has a "ttl" field which is used to specify the
deadline for this request. The transmitter manages the ttl to account for time
in transit or time to failover, and send it to receivers only for deadline
propagation purposes.  This allows receivers to know how much time they have
remaining to complete this portion of the request. Intermediaries are free to
make retries with backoff as necessary, as long as they are still within the
ttl.

Here are some details of the message flow from a service A instance A1, through
a service router R1, into a service B instance B1, and then back. These are not
the full details of every single field, but they are intended to illustrate
some less obvious behaviors.

The flow in this example is: `A1 -> R1 -> B1 -> R1 -> A1`

A1 sends "call req" (type 0x03) to R1:

1. select a message id M1 for this frame, in a predictable sequence for easier
   debugging. This will be used to match up the response to this request. The
   scope of M1 exists only between A1 and R1 and only for this connection.
2. generate a unique traceid which will be propagated to any dependent
   requests. This should only be done if A1 is the edge-most service in the
   call chain. The point of this unique traceid is to build a span tree that
   covers all RPCs supporting a given client-visible transaction, not just
   tracing of a single logical request through multiple intermediaries.
3. generate a unique spanid which is used to refer to this specific step in the
   network
4. set the ttl to the maximum allowable time for this request. If a response
   cannot be sent within this time, downstream nodes will cancel the request.
5. A1 doesn't need any headers, so defaults are used
6. a "call req" body is generated with service\_name "service B", application
   payload args, and checksum

R1 receives "call req" from A1, sends "call req" (0x03) to B1:

1. select message id M2 for this frame
2. copy traceid from incoming message to traceid of new message
3. copy spanid from incoming message to parentid of new message
4. generate unique spanid
5. copy ttl from incoming message to ttl of new message
6. copy service name, args, and csum data to new message

B1 receives "call req" from R1, sends "call res" (0x04) to R1:

1. use message id M2 for this frame
2. send args from application response and compute csum

R1 receives "call res" from B1, send "call res" (0x03) to A1:

1. match incoming message id M2 with existing "call req"
2. use message id M1 for new message
3. copy args/csum from incoming message

A1 receives "call res" from R1:

1. match incoming message M1 with existing "call req"
2. deliver args to application

## Framing

All frames of all types use this structure:

```
----------------------------------------------
| 0-7  | size:2 | type:1 | reserved:1 | id:4 |
|------|-------------------------------------|
| 8-15 | reserved:8                          |
|------|-------------------------------------|
| 16+  | payload - based on type             |
----------------------------------------------
```

### size:2

Total length of this frame in bytes, including the framing header and body.
Note that this limits the total size of a frame to 64KiB, even though some of
the other fields are also specified with 16 bit sizes. Implementations must
take care to not exceed the total frame size of 64KiB.

### type:1

Type of the payload.  Valid types are:

code   | name              | description
-------|-------------------|------------
`0x01` | init req          | First message on every connection must be init
`0x02` | init res          | Remote response to init req
`0x03` | call req          | RPC method request
`0x04` | call res          | RPC method response
`0x13` | call req continue | RPC request continuation fragment
`0x14` | call res continue | RPC response continuation fragment
`0xc0` | cancel            | Cancel an outstanding call req / forward req (no body)
`0xc1` | claim             | Claim / cancel a redundant request
`0xd0` | ping req          | Protocol level ping req (no body)
`0xd1` | ping res          | Ping res (no body)
`0xff` | error             | Protocol level error.

The framing layer is common to all payloads. It intentionally limits the frame
size to 64KiB to allow better interleaving of frames across a shared TCP
connection. In order to handle most operations implementations will need to
decode some part of the payload.

### id:4

An identifier for this message that is chosen by the sender of a request. This
id is only valid for this sender on this connection. This is similar to how TCP
has a sequence number in each direction. Each side of a connection may happen
to select overlapping message ids, which is fine because they are directional.

`id` represents the top level message id. Both request frames and response
frames use the same id, which is how they are matched up. A single id may be
used across multiple request or response frames after being broken up into a
sequence of fragments, as described below.

Valid values for "id" are from `0` to `0xFFFFFFFE`. The value `0xFFFFFFFF` is
reserved for protocol error responses.

### reserved:8

Unused space for future protocol revisions, padded for read alignment, which
may or may not help on modern Intel processors.

### payload

0 or more bytes whose contents are determined by the frame type.

The length of the payload is frame `size` - 16.

Full details on each payload body follow below.

## Payload: init req (type 0x01)

Schema:
```
version:2 nh:2 (key~2 value~2){nh}
```

This must be the first message sent on a new connection. It is used to
negotiate a common protocol version and describe the service names on both
ends. In the future, we will likely use this to negotiate authentication and
authorization between services.

### version

`version` is a 16 bit number. The currently specified protocol version is 2. If
new versions are required, this is where a common version can be negotiated.

### headers

There are a variable number of key/value pairs. For version 2, the following
are required:

name            | format             | description
----------------|--------------------|------------
`host_port`    | `address:port`     | where this process can be reached
`process_name` | *arbitrary string* | additional identifier for this instance, used for logging

For forward compatibility, implementations should ignore headers other than
these listed above.

For connections where listening for new connections is not possible or doesn't make sense,
implementations should send a `host_port` value of `0.0.0.0:0`. This special value tells
receiving implementations to use the results of `getpeername(2)` or equivalent API to uniquely
identify this connection. It also tells receivers that this address is not valid beyond this
connection, so it should not be forwarded to other nodes.

## Payload: init res (type 0x02)

Schema:
```
version:2 nh:2 (key~2 value~2){nh}
```

The initiator requests a version number, and the server responds with the
actual version that will be used for the rest of this connection. The
name/values are the same, but identify the server.

## Payload: call req (type 0x03)

Schema:
```
flags:1 ttl:4 tracing:25
service~1 nh:1 (hk~1 hv~1){nh}
csumtype:1 (csum:4){0,1} arg1~2 arg2~2 arg3~2
```

This is the primary RPC mechanism. The triple of `(arg1, arg2, arg3)` is sent
to "service" via the remote end of this connection.

Whether connecting directly to a service or through a service router, the
service name is always specified.  This supports an explicit router model as
well as peers electing to delegate some requests to another service.

A forwarding intermediary can relay payloads without understanding the contents
of the args triple.

A "call req" may be fragmented across multiple frames. If so, the first frame
is a "call req", and all subsequent frames are "call req continue" frames.

### flags:1

Used to control fragmentation. Valid flags:

flag   | description
-------|------------
`0x01` | more fragments follow

If the fragments flag isn't set, then this is the only/last frame for this
message id.

### ttl:4

Time To Live in milliseconds. Intermediaries should decrement this as
appropriate when making dependent requests. Since all numbers are unsigned the
ttl can never be less than 0. Care should be taken when decrementing ttl to
make sure it doesn't go below 0. Requests should never be sent with ttl of 0.
If the ttl expires an error response should be generated.

### tracing:25

Tracing payload, see tracing section.
### service~1

UTF-8 string identifying the destination service to which this request should be
routed.

### nh:1 (hk~1 hv~1){nh}

Transport headers described below in the "Transport Headers" section.

### csumtype:1 (csum:4){0,1}

Checksum described below in the "checksums" section.

### arg1~2 arg2~2 arg3~2

The meaning of the three args depends on the systems on each end. The format of
arg1, arg2, and arg3 is unspecified at the transport level. These are opaque
binary blobs as far as tchannel is concerned.

The size of `arg1` is at most 16 kilobytes.

Future versions will likely allow callers to specify specific service instances
on which to run this request, or a mechanism to route a certain percentage of
all traffic to a subset of instances for canary analysis.

## Payload: call res (0x04)

Schema:
```
flags:1 code:1 tracing:25
nh:1 (hk~1 hv~1){nh}
csumtype:1 (csum:4){0,1} arg1~2 arg2~2 arg3~2
```

Very similar to call req (type 0x03), differing only in:

- adds a `code` field
- no `ttl` field
- no `service` field

All common fields have identical definition to call req, see its section above for detail.  It is not necessary for arg1 to have the same value between the call req and the call res; by convention, existing implementations leave arg1 at zero length for call res messages.

The size of `arg1` is at most 16 kilobytes.

Headers described below in the "Transport Headers" section.

### code:1

Response code:

code   | name  | description
-------|-------|------------
`0x00` | OK    | everything is great and we value your contribution.
`0x01` | Error | application error, details are in the args.

Non-zero code does not imply anything about whether this request should be retried.

Implementations should implement unix-style zero / non-zero logic to be future
safe to other "not ok" codes.

## Payload: cancel (0xC0)

Schema:
```
ttl:4 tracing:25 why~2
```

This message forces the original response to a "call req" with an error
type of 0x02 (cancelled).

The id in the frame of the cancel message should match the id of the req frame
intended to be cancelled.

Note that since message ids are scoped to a connection, canceling a message
might trigger the cancellation of one or more dependent messages.

"why" is a string describing why the cancel was initiated. It is used only for
logging.

It should be noted that the response and cancellation message could pass each
other in flight, so we need to be able to handle a response after it was
cancelled. We also need to be able to handle duplicated responses for similar
reasons. The edges of this network need to implement their own de-duping
strategy if necessary.

## Payload: call req continue (type 0x13)

Schema:
```
flags:1 csumtype:1 (csum:4){0,1} {continuation}
```

This frame continues a "call req" as described in the "fragmentation" section
below.

"flags" has the same definition as in "call req": to control fragmentation.

## Payload: call res continue (type 0x14)

Schema:
```
flags:1 csumtype:1 (csum:4){0,1} {continuation}
```

This frame continues a "call res" as described in "fragmentation" section
below.

"flags" has the same definition as in "call req": to control fragmentation.

## Payload: claim (0xC1)

Schema:
```
ttl:4 tracing:25
```

This message is used to claim or cancel a redundant request. When a request is
sent to multiple nodes, as they start or finish work, depending on the option,
they will tell the other nodes about this to minimize extra work. This claim
message is sent from worker to to worker. The claimed request is referred to by
its full zipkin tracing data, which was chosen by the originator of the first
request.

When a worker B receives a claim message from worker A for a tracing T that B
doesn't know about, B will note this for a short time. If B later receives a
request for T, B will silently ignore T. This is expected to be the common
case, because the forwarding router will add some delay after sending to A and
before sending to B.

This is an implementation of Google's "The Tail at Scale" paper where they
describe "backup requests with cross-server cancellation". Slides from a
presentation about this paper are here:

http://static.googleusercontent.com/media/research.google.com/en/us/people/jeff/Berkeley-Latency-Mar2012.pdf

The relevant section starts on page 39. A video of this talk is here:

http://youtu.be/C_PxVdQmfpk?t=26m45s

## Payload: ping req (0xD0)

Used to verify that the protocol is functioning correctly over a connection.
The receiving side will send back a "ping res" message, but this is not
expected to be visible to the application. If more detailed health checking and
validation checks are desired, these can be implemented at a higher level with
"call req" and "call res" messages.

This message type has no body.

## Payload: ping res (0xD1)

Always sent in response to a "ping req". Sending this does not necessarily mean
the service is "healthy." It only validates connectivity and basic protocol
functionality.

This message type has no body.

## Payload: error (0xFF)

Schema:
```
code:1 tracing:25 message~2
```

Response message to a failure at the protocol level or when the system was
unable to invoke the requested RPC for some reason. Application errors do not
go here. Application errors are sent with "call res" messages and application
specific exception data in the args.

### code:1

code   | name                 | description
-------|----------------------|------------
`0x00` | invalid              | Not a valid value for `code`. Do not use.
`0x01` | timeout              | No nodes responded successfully within the ttl deadline.
`0x02` | cancelled            | Request was cancelled with a cancel message.
`0x03` | busy                 | Node is too busy, this request is safe to retry elsewhere if desired, prefer other peers for future requests where possible.
`0x04` | declined             | Node declined request for reasons other than load, the request is safe to retry elsewhere if desired, do not change peer preferencing for future requests.
`0x05` | unexpected error     | Request resulted in an unexpected error. The request may have been completed before the error, retry only if the request is idempotent or duplicate execution can be handled.
`0x06` | bad request          | Request args do not match expectations, request will never be satisfied, do not retry.
`0x07` | network error        | A network error (e.g. socket error) occurred.
`0x08` | unhealthy            | A relay on the network declined to forward the request to an unhealthy node, do not retry.
`0xFF` | fatal protocol error | Connection will close after this frame. message ID of this frame should be `0xFFFFFFFF`.

### id:4

Message id of the original request that triggered this error, or `0xFFFFFFFF` if
no message id is available.

### message~2

A human readable string not intended to be shown to the user. This is something
that goes into error logs to help engineers in the future debug code they've
never seen before. We will likely need to adopt some kind of convention around
the contents of this field, particularly so that they can be parseable for
proper search indexing and aggregation. However, for the purposes of the
protocol, the contents of "message" are intentionally not specified.

## Tracing

Schema:
```
spanid:8 parentid:8 traceid:8 traceflags:1
```

field        | type  | description
-------------|-------|------------
`spanid`     | int64 | that identifies the current *span*
`parentid`   | int64 | of the previous *span*
`traceid`    | int64 | assigned by the original requestor
`traceflags` | uint8 | bit flags field

A *span* is a logical operation like call or forward

The `traceid` does not change as it propagates through various services.

When a request enters our system the edge-most requester selects a `traceid`
which will remain unchanged as this message and any dependent messages move
through the system. Each time a new request is generated a new `spanid` is
generated. If it was started from a previous request that id is moved to the
`parentid`.


Trace flags:

flag   | description
-------|------------
`0x01` | tracing enabled for this request

When the enabled flag is not set, the tracing data is still required to be
present in the frame, but the tracing data will not necessarily be sent to
zipkin.

## Transport Headers

These headers are intended to control things at the transport and routing
layer, so they are expected to be small and inexpensive to process.
Application level headers can be expressed at a higher level in the protocol.

Duplicate header keys are not allowed and should result in a parse error.

Header keys may not be 0 length (should result in a parse error), but header
values may be 0 length.

Header keys have a maximum length of 16 bytes;
The total number of transport headers allowed is 128

Schema:
```
nh:1 (hk~1 hv~1){nh}
```

TChannel headers are 0 or more UTF-8 string key/value pairs.

The number of headers is sent with the first byte (`nh`).

If `nh` is 0 then there are no bytes in the headers section.

If nh is 1 or more, then that many key/value pairs follow.

Each key and value string is preceded by one byte encoding its length.

For example, the following hex dump:

```
0103 6369 6402 6869  ..cid.hi
```

Encodes exactly one key/val pair: `("cid", "hi")`.

The following table lists the valid transport header keys and whether they are
valid or not in a call req or res.  Following sections will elaborate on details.

name  | req | res | description
------|-----|-----|---------------
`as`  | Y   | Y   | the Arg Scheme
`cas` | Y   | N   | Claim At Start
`caf` | Y   | N   | Claim At Finish
`cn`  | Y   | N   | Caller Name
`re`  | Y   | N   | Retry Flags
`se`  | Y   | N   | Speculative Execution
`fd`  | Y   | Y   | Failure Domain

### Transport Header `as` -- Arg Scheme

This describes the format of the args for endpoint handlers and/or protocol
inspectors. The primary RPC mechanism will use "thrift". "http" and "json" are
used for interop with other systems.

The following table describes the valid `as` values and their corresponding
arg1, arg2, and arg3 forms:

value    | arg1                  | arg2                                     | arg3
---------|-----------------------|------------------------------------------|---------------
`thrift` | string method name    | application headers `nh:2 (k~2 v~2){nh}` | thrift payload
`json`   | method name as string | application headers as JSON              | body as JSON
`http`   | method + URI          | headers as JSON array                    | raw body
`raw`    | raw bytes             | raw bytes                                | raw bytes

### Transport Header `cas` -- Claim At Start

Value is string "host:port".

This request has also been sent to another instance running at `host:port`.
Send a claim message when work is started.

### Transport Header `caf` -- Claim At Finish

Value is string "host:port".

Send claim message to `host:port` when response is being sent.

### Transport Header `cn` -- Caller Name

Value is name of the service making the call.

### Transport Header `re` -- Retry Flags

Flags are encoded as a UTF-8 string, as are all header values. Each flag is
represented by a single character:

`n` | no retry, expose all errors immediately - cancels `c` and `t`
`c` | retry on connection error. The specific mechanism of retry is not specified by tchannel. Actual retries are handled by the routing layer.
`t` | retry on timeout

Valid values for `re` are:

value | description
------|------------
`c`   | retry on connection error; this is the default
`t`   | retry on timeout
`n`   | no retry
`ct`  | retry on connection error or timeout
`tc`  | retry on connection error or timeout

### Transport Header `se` -- Speculative Execution

Speculative execution count, encoded as a single digit (therefore <10) ascii
digit. Indicates the number of nodes on which to run the request.

The only valid value for `se` in this version of the protocol is `2` (ascii
`0x32`).

In the future we may extend this speculative execution system to more than 2
nodes. In the interests of simplicity and minimizing confusion we are
intentionally limiting the `se` factor to 2.

### Transport Header `fd` -- Failure Domain

A string describing a group of related requests to the same service that are
likely to fail in the same way if they were to fail.

For example some requests might have a downstream dependency on another
service, while others might be handled entirely within the requested service.
This is used to implement Hystrix-like "circuit breaker" behavior.

### A note on `host:port` header values

While these `host:port` fields are indeed strings, the intention is to provide
the address where other entities not directly connected can reach back to this
exact entity. In the current world of IPv4, these `host:port` fields should be
an IPv4 address as "dotted quad" ASCII, followed by a colon, and then the
listening port number, in ASCII.

This field should not use hostnames or DNS names, unless we find a compelling
reason to use them.

Examples:

- `10.0.0.1:12345` -- IPv4 host and port
- `[1fff:0:a88:85a3::ac1f]:8001` -- IPv6 host and port

Note that since IPv6 addresses have colons in the address part, implementations
should use the last colon in the string to separate the address from the port.

## Deadlines and the TTL

The TTL is the amount of time the calling service is willing to wait for the
called portion of the call graph to complete. An instance may retry as often as
they like so long as they continue to meet that deadline. To propagate the
deadline downstream, all new calls that you make should be done with a TTL that
equals the TTL assigned to you minus the amount of time you've already spent
since receiving the request. It may help to add some fuzz for network latency.

TTLs are not sent back with the response. It is up to the calling service to
track the time spent with dependent requests and validate the incoming deadline
before dispatching every new dependent request.

## Checksums

Checksums are optional in order to ease implementations in different languages
and platforms. While TCP provides a checksum within the scope of a connection,
tchannel payloads are potentially forwarded through multiple TCP connections.
By adding a checksum at the source, intermediaries and the destination can
validate that the payload hasn't been corrupted. Validating these checksums and
rejecting frames with invalid checksums is desirable, but not required.

Checksums are computed across all three args like this:

```
csum = func(arg1, 0);
csum = func(arg2, csum);
csum = func(arg3, csum);
```

This behavior changes slightly when messages are fragmented. See the
"fragmentation" seciton below.

### Checksum types:

`type:1` | scheme                 | value length
---------|------------------------|-------------
`0x00`   | none                   | 0 bytes
`0x01`   | crc-32 (adler-32)      | 4 bytes
`0x02`   | farmhash Fingerprint32 | 4 bytes
`0x03`   | crc-32C                | 4 bytes

CRC32 is intended as a checksum as defined by Adler for zlib (technically this
isn't a CRC according to wikipedia, although it seems to be frequently confused
with one).

Farmhash is a hash function with excellent distribution. It is surprisingly
faster than CRC32 on modern CPUs, depending on how it is compiled.

CRC32-C is the Castagnoli variant which is implemented directly by Intel CPUS
(SSE4.2) and used by other systems (e.g. btrfs, ext4, SCTP).

## Fragmentation

There are two important and potentially overlapping cases to support with
fragmentation:

1. large messages  whose args do not fit into a single frame
2. messages whose total size is not known when the request is initiated,
   similar to HTTP's chunked encoding

The maximum size of an individual frame is intentionally limited to 64KiB to
avoid head of line blocking on a shared TCP connection. This size restriction
allows frames from other messages to be interleaved with frames of the larger
message. Limiting the size also reduces the buffering requirements on any
intermediary nodes and may support the use of fixed allocations in some
implementations.

All of the call req / call res fields before checksum, arg1, arg2, and arg3
must fit in a single frame.

After sending these fields, the checksum args are sent, or as much of the args
as will fit into this frame. If the combined size of the frame is less than
64KiB, the frame is complete, and the "more fragments follow" flag bit is not
set. However, if there is not enough space in the frame to fit the checksum and
all of the args, then this message is continued with a "call req continue"
frame. On the last "call req continue" frame, the "more fragments follow" flag
is not set, and the message is complete.

Since the full size of a given arg may not be known in advance, the the size
fields in the frames represent how much of that arg is present in this frame.
An arg is considered complete when there is more data in a frame past the end
of that arg. If the arg happens to end on an exact frame boundary, the next
continuation frame will start with a size of 0 bytes for that arg.

Checksums are computed for the contents of the frame, with all of the args data
that is present in that frame. The checksum for each frame is seeded with the
cumulative checksum from the previous frames. This allows corruption to be
detected before delivering arg payloads to the application.

### Example:

Sending a "call req" with a 4 byte arg1, a 2 byte arg2, and an 8 byte arg3. The
args are streamed in tiny fragments as an easier to comprehend example of
fragmentation. This might happen in the real world if a producer is streaming
updates as they arrive. If the total sending size is known in advance, then
sending the largest frames possible is preferable.

Frame 1 is a "call req" (type 0x03) with the "more fragments remain" flag set.
The ttl, tracing, traceflags, service, and headers are all set to some
reasonable values. We have 2 data bytes of arg1 available, but arg1 is
incomplete. We compute the checksum over arg1's 2 bytes with a seed of 0. When
sending arg1, we specify a length of 2 bytes, the data bytes of which are the
last 2 bytes in the frame. The receiving parser notes that arg1 is incomplete.

Frame 2 is a "call req continue" (type 0x13) with the "more fragments remain"
flag set. 2 more bytes of arg1 are now available, as are 2 bytes of arg2. The
checksum is computed over this frame's contents for arg1 and arg2 using the
seed from the previous frame of 0xBEEF. The receiving parser knows that it is
continuing arg1. Arg1 in this frame has 2 bytes, but there are still more bytes
in this frame, so the receiving parser knows that arg1 is now complete. There
are 2 bytes of arg2 that end this frame. The receiving parser notes that arg2
is incomplete, even though we know that no more bytes will follow from arg2.
This is done to illustrate what happens when an arg ends on an exact frame
boundary.

Frame 3 is a "call req continue" (type 0x13) with the "more fragments remain"
flag cleared. There are 0 bytes from arg2 and 8 bytes from arg3. The checksum
is generated with 8 bytes from arg3 and the seed from the previous frame of
0xDEAD. The receiving parser knows that it is continuing arg2, and the 0 length
indicates that arg2 is finished. The 8 bytes of arg3 are read, which fall on
the frame boundary. The receiving parser knows that arg3 is complete because
the "more fragments remain" flag was not set.

type | id | payload | state after parsing
-----|----|---------|--------------------
0x03 | 1  | flags:1=0x1, ttl:4=0x2328, tracing:24=0x1,0x2,0x3, traceflags:1=0x1, service~1=0x5"svc A", nh:1=0x1, hk~1=0x1"k", hv~1=0xA"abcdefghij", csumtype:1=0x2 csum:4=0xBEEF arg1~2=0x2<2 bytes> | sending arg1
0x13 | 1  | flags:1=0x1, csumtype:1=0x2 csum:4=0xDEAD arg1~2=0x2<2 bytes> arg2~2=0x2<2 bytes> | sending arg2
0x13 | 1  | flags:1=0x0, csumtype:1=0x2 csum:4=0xF00F arg2~2=0x0<0 bytes> arg3~2=0x8<8 bytes> | complete
