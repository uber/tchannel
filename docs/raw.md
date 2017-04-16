# as=raw for TChannel

This document outlines what the raw encoding is.

The `as=raw` encoding is intended for any custom encodings you want to do that
are not part of TChannel but are application specific.

Consider using the `thrift`, `sthrift`, `json` or `http` encodings
before using `as=raw`.

## Arguments

 - `arg1` : endpoint
 - `arg2` : raw bytes
 - `arg3` : raw bytes
