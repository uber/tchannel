# TChannel

Network multiplexing and framing protocol for RPC

## Design goals

- Easy to implement in multiple languages, especially JS and Python.
- High performance forwarding path.  Intermediaries can make a forwarding
  decision quickly.
- Request / response model with out of order responses.  Slow requests will not
  block subsequent faster requests at head of line.
- Large requests/responses may/must be broken into fragments to be sent
  progressively.
- Optional checksums.
- Can be used to transport multiple protocols between endpoints, eg. HTTP+JSON
  and Thrift.

## MIT Licenced
