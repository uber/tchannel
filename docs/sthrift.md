Streaming Thrift
================

Streaming Thrift allows requests or responses to be streamed over TChannel.

Streaming Thrift will uses a separate `as` header: `sthrift`, and is based
on the standard Thrift protocol, with the only exception being the encoding
of arg3 in both the `call req` and `call res`.

The encoding of data for streaming arg3 is a 4 byte length-prefixed chunk:
```
chunk~4 chunk~4 chunk~4 ...
```

Each chunk is a Thrift encoded payload using TBinaryProtocol.
There is no limit to the number of chunks that can be streamed.

Streaming Thrift methods have the following restrictions:
 * If the request is streamed, the method IDL should only specify a single
   argument. It is suggested that this argument is a struct.
 * Thrift exceptions must be returned before any streaming results have been
   sent.


Arguments
---------
When streaming request arguments, each `arg3` chunk is the encoded payload for
the method's first (and only) argument.
For example, if a method defines a single argument that is a string, then
each chunk is just a Thrift encoded string.


Responses
---------
When streaming successful (`OK`) responses, each `arg3` chunk is the encoded
payload for the method's result type.
For example, if a method returns a string, then each chunk should be a
Thrift encoded string.

If the response is not `OK`, `arg3` is encoded in the same manner as
non-streaming Thrift. E.g. if the response returned a Thrift exception, `arg3`
contains a TBinaryProtocol encoded version of a struct containing the exception
field and struct.
