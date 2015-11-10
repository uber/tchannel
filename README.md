# TChannel [![Build Status](https://travis-ci.org/uber/tchannel.svg?branch=master)] (https://travis-ci.org/uber/tchannel)

Network multiplexing and framing protocol for RPC

* [Read the Docs][RTD]
* Languages: [Node.js][node], [Python][python], [Go][go], [Java][java]
* Questions: Open a [Github issue][issues]
* Uber's [OSS website][oss]

## Overview

TChannel is a networking framing protocol used for general RPC, supporting out-of-order responses at extremely high performance where intermediaries can make a forwarding decision quickly. It is easy to implement in multiple languages, especially JavaScript and Python.

## Design Goals

- Easy implementation in multiple languages
- High performance forwarding path where intermediaries can make forwarding
  decisions quickly
- Request/response model with out-of-order responses so that slow requests don't
  block subsequent faster requests at the head of the line
- Ability of large requests/responses to be broken into fragments and sent
  progressively
- Optional checksums
- Ability to transport multiple protocols between endpoints (e.g., HTTP+JSON
  and Thrift)

## Components

- [tchannel-protocol](https://github.com/uber/tchannel/tree/master/docs/protocol.md) TChannel Protocol Documentation
- [tchannel-node](https://github.com/uber/tchannel-node) TChannel
  peer library for Node.js
- [tchannel-python](https://github.com/uber/tchannel-python)
  TChannel peer library for Python
- [tchannel-go](https://github.com/uber/tchannel-go)
  TChannel peer library for Go
- [tchannel-java](https://github.com/uber/tchannel-java)
  TChannel peer library for the JVM
- [tcurl](https://github.com/uber/tcurl) TChannel curl program, for making manual
  one-off requests to TChannel servers
- [tcap](https://github.com/uber/tcap/) TChannel packet capture tool, for
  eavesdropping and inspecting TChannel traffic
- [bufrw](https://github.com/uber/bufrw/) Node.js buffer structured reading and
  writing library, used for TChannel and [Thrift][]
- [thriftrw](https://github.com/uber/thriftrw) Node.js [Thrift][] buffer reader
  and writer

[Thrift]: https://thrift.apache.org/
[node]: https://github.com/uber/tchannel-node
[python]: https://github.com/uber/tchannel-python
[go]: https://github.com/uber/tchannel-go
[java]: https://github.com/uber/tchannel-java
[RTD]: http://tchannel.readthedocs.org/en/latest/
[issues]: https://github.com/uber/hyperbahn/issues
[oss]: https://uber.github.io/

## MIT Licensed
