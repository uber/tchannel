## Protocol Details

A frame consists of a header and three arguments. At the byte
    level this looks like

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+
|  FRAME_TYPE   |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                            FRAME_ID                           |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                            FRAME_SEQ                          |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                           ARG1_LENGTH                         |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                           ARG2_LENGTH                         |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                           ARG3_LENGTH                         |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                            CHECKSUM                           |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/                                                               /
/                              ARG1                             /
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/                                                               /
/                              ARG2                             /
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/                                                               /
/                              ARG3                             /
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```
All 4-byte integers are unsigned and in big-endian.

 - The first byte is the frame type
 - The next 4 bytes are the frame id
 - The next 4 bytes are the frame sequence
 - The next 4 bytes is the length of argument 1
 - The next 4 bytes is the length of argument 2
 - The next 4 bytes is the length of argument 3
 - The next 4 bytes is the checksum which is farmhash'ed of arg(s)
 - The next N bytes is arg 2, N is based on the length of arg 1
 - The next M bytes is arg 2, M is based on the length of arg 2
 - The next P bytes is arg 3, P is based on the length of arg 3

## Protocol frame type

There are currently 7 frame types. These are encoded in the
    the current protocol as the frame type.

### `req_complete_message`

value: `0x01`

The `req_complete_message` type means that this frame is a full
    request to a remote server.

This frame should be parsed as a request where:

 - arg1 is the name of the operation, as a string
 - arg2 is the head of the request, as a blob
 - arg3 is the body of the request, as a blob

### `req_message_fragment`

value: `0x02`

The `req_message_fragment` is an unimplemented type. It will
    be used in the future to implement streaming.

### `req_last_fragment`

value: `0x03`

The `req_last_fragment` is an unimplemented type. It will
    be used in the future to implement streaming.

### `res_complete_message`

value: `0x80`

The `res_complete_message` type means that this frame is a full
    response from a remote server.

This response is always concidered a successful response.

This frame should be parsed as a response where:

 - arg1 is the name of the operation, as a string (redundant)
 - arg2 is the head of the response, as a blob
 - arg3 is the body of the response, as a blob

### `res_message_fragment`

value: `0x81`

The `res_message_fragment` is an unimplemented type. It will
    be used in the future to implement streaming.

### `res_last_fragment`

value: `0x82`

The `res_last_fragment` is an unimplemented type. It will
    be used in the future to implement streaming.

### `res_error`

value: `0xC0`

The `res_error` type means that this frame is a full response
    from a remote server.

This response is always coincidered an unsuccessful response.

This frame should be parsed as a response error where

 - arg1 is the error encoded as a string
 - arg2 is empty
 - arg3 is empty

## Protocol frame id

Each frame has an id, this allows you to implement RPC.

You can send an outgoing `req_complete_message` with a certain
    frame id. The remote server can then send back an incoming
    `res_complete_message` with the same frame id.

The frame id does not have to be unique. The current
    implementation uses an incrementing counter per outgoing
    socket.

## Protocol frame seq

Each frame has a sequence number, this allows you to implement 
    streaming.

The current implementation of `TChannel` doesn't implement
    streaming yet but you could combine multiple
    `req_message_fragment` together in order using their
    sequence id to build a single frame.

## Protocol arg1 length

The length of arg 1 in bytes

## Protocol arg2 length

The length of arg 2 in bytes

## Protocol arg3 length

The length of arg 3 in bytes

## Protocol arg 1

The first argument in the frame.

Currently this is always a UTF8 string.

## Protocol arg 2

The second argument in the frame.

This is considered the `head` argument and should be smaller
    then the third argument.

Currently this is a blob.

## Protocol arg 3

The third argument in the frame.

This is considered the `body` argument and should be the main
    payload of the frame.

Currently this is a blob.
