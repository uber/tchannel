# TChannel [![Build Status](https://travis-ci.org/uber/tchannel.svg?branch=master)] (https://travis-ci.org/uber/tchannel)

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

## Parts

- [tchannel-node](https://github.com/uber/tchannel/tree/master/node) TChannel
  peer library for Node.js
- [tchannel-python](https://github.com/uber/tchannel/tree/master/python)
  TChannel peer library for Python
- [tchannel-golang](https://github.com/uber/tchannel/tree/master/golang)
  TChannel peer library for Go
- [tcurl](https://github.com/uber/tcurl) TChannel curl program, for making manual
  one-off requests to TChannel servers.
- [tcap](https://github.com/uber/tcap/) TChannel packet capture tool, for
  eavesdropping and inspecting TChannel traffic
- [bufrw](https://github.com/uber/bufrw/) Node.js buffer structured reading and
  writing library, used for TChannel and [Thrift][]
- [thriftrw](https://github.com/uber/thriftrw) Node.js [Thrift][] buffer reader
  and writer
- [thriftify](https://github.com/uber/thriftify) Node.js [Thrift][] object
  serializer and deserializer with run-time Thrift IDL compiler

[Thrift]: https://thrift.apache.org/

## MIT Licenced
