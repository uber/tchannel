### TChannel client Errors. Errors from `.request().send()`

When making an `OutRequest` there are multiple edge cases
that can go happen. There are multiple operational errors that
can occur.

#### Writing errors.

When we write `TChannelFrame` objects to the
socket, we can get exceptions serializing these frames. The
current implementation will only throw these exceptions and
thus are considered fatal bugs.

#### Handler errors

When something goes wrong with the frames or the order we 
receive them in we will get a handler error.

For example, receiving an unknown frame type or receiving multiple
init requests.

When an error occurs on the handler we reset the connection with
the error; thus error out all pending outgoing requests.

We also destroy the TCP socket

#### Reading errors

When we get bytes on the wire we try to interpret them as a valid
TChannel frame. When we fail to interpret them we emit an error
on the `Reader`.

Currently we only log instead of sending an error frame and
resetting the connection.

#### Incoming error frames

An outgoing call request can get an incoming error frame as 
a response. In the current implementation we build an error
object for the incoming error frame.

Any error created from an error frame will have the `isErrorFrame`
boolean set to `true`.

#### TCP socket errors

When an error happens on the tcp socket connection we will
`resetAll()` the connection with the error.

This errors out all pending requests but does not close the
socket. Although the socket errored so its already closed.

#### TCP socket closes

When we get a socket close we errror out all pending outgoing
requests with a socket closed error.

This does not close the socket, but on socket close event its
already closed.

The error that pending requests get will be `socket closed` error.

#### TChannel Server close

If someone closes the tchannel server we will error out all
pending outgoing requests as well as all sockets.

The error that pending requests get will be `shutdown from quit`
error.

#### TChannel client timeouts

Every outgoing tchannel request has a timeout associated with
it in the client. This defaults to 100.

If there is no call response or error frame for the outgoing
id within the timeout the pending request will be errored.

The error it receives is a `timed out` error.
