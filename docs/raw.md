# as=raw for TChannel

This document outlines what the raw encoding is.

The `as=raw` encoded is intended for any custom encodings you want to do that
are not part of tchannel but are application specific.

Consider using the `thrift`, `sthrift`, `json` or `http` encodigns
before using `as=raw`.

## Arguments

 - `arg1` : raw bytes
 - `arg2` : raw bytes
 - `arg3` : raw bytes
