h1. Functionality

- [ ] Cancel outbound requests
    - Sends cancel message to server
    - If server has made requests, should cancel those requests as well
    - Should return from blocking calls with context.Cancelled

- [ ] Cancel on start and cancel on finish
- [X] Pass Zipkin Tracing info as Context value, propagate to outbound Context
- [ ] Implement Farm32
- [ ] Outbound connection pool management
- [ ] Track connections and do graceful shutdown when the channel is closed
- [ ] Provide a way to throttle max # of incoming requests
- [ ] Retry on retryable errors
- [ ] Allow setting the content type headers
- [X] Add JSONInput/JSONOutput argument types
- [ ] Add ThriftInput/ThriftOutput argument types
- [ ] Implement ping/pong handling

h1. Cleanup

- [X] Get rid of custom IOError type - not needed and misleading
- [ ] Refactor bodyReader to work like bodyWriter and operate over the entire body not just an argument
- [ ] Move message dumping into a separate hexer, make configurable
- [X] Remove hard-dependency on go-logging and replace with Logger interface
- [ ] Make sure we don't leak frames anywhere (I know we do)
- [ ] Implement real FramePool based on sync.Pool
- [X] Pass remotePeerInfo into inbound and outbound pipelines, once handshaking is complete.  Alternately don't create those pipelines until after 
- [ ] Benchmark
- [X] Review and edit godocs 

h1. Tests

h2. Handshake and general connection tests

1. Attempt to handshake after active
2. Attempt to handshake on closed connection
3. Attempt to handshake on inbound connetion
4. Server sends bad protocol version
5. Client sends bad protocol version
5. Client sends non init-req message as first in stream
6. Timeout waiting for init-res
7. Server immediately sends call-res after init-res
8. Receive unknown frame type
9. Server hangs up during read of request
10. Client hangs up during read of response

h2. Fragmentation error tests

1. Attempt to read from argument after argument has been completed
2. Attempt to write to stream after last fragment sent
3. Bad checksum value on read
4. Second received fragment has different checksum type than first fragment
5. Error retrieving fragment
6. Error beginning fragment on write
7. Chunk size does not fit into current fragment
8. Error flushing fragment on write
9. Error beginning new fragment for empty chunk
10. Error flushing final fragment on completion
11. Reader thinks they've finished with an argument, but there is more data in the chunk
12. Reader thinks they've finished with an argument, but there is more data for that argument in a subsequent fragment


h2. Outbound tests

1. Attempt to make a call after the deadline has past results in a short circuit
2. Attempt to make an outbound call for a request that is still active
3. Make sure that expired response channels are proactively removed
4. Can't enqueue to response channel results in call failing
5. Receive CallRes for an expired request
6. Proactively remove response channels for expired and waiting calls
7. Error frame received for non-existent response
8. Attempt to make call from invalid state:
    * connection not ready
    * connection closed
9. Attempt to WriteArg2 twice
10. Attempt to WriteArg3 twice
11. Error allocating outbound fragment results in call terminating
12. Timeout / cancel while flushing fragment results in call terminating
13. Unable to send to send channel results in call terminating
14. Attempt to ReadArg2 twice
15. Attempt to ReadArg3 twice
16. Error reading arg2 (e.g. bad parse)
17. Error reading arg3 (e.g. pad parse)
18. Recv bad response frame for message
19. Die on protocol error

h3. Inbound Tests

1. Receive duplicate request id
2. Cannot parse first fragment for request
3. Receive continue request fragment for req that expired
4. Application not pulling request frames quickly enough causes request to die
5. Proactive remove request channels for expired and waiting calls
6. readOperation twice
7. Error reading operation?
8. ReadArg2 twice
9. ReadArg3 twice
10. Timeout waiting for request fragment results in call being terminated
11. Error parsing request fragment results in call being terminated
12. Returning application error
13. Attempting to return application error after arg2 is sent results in error
14. Unable to send system error 
15. Frame sender dead so response fragment cannot be flushed


