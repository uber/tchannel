# Running cross language tests

TODO: add a suite runner that runs all implemented tests against a given
language.

## Using `node/scripts/xlang_test.js`

Usage:

```
node/scripts/xlang_test.js [options] <language> -- <test-program> [test programs args...]
```

Options:
- --verbose / -v, prints commands before running them
- --noinstall / -n, disables running an install for the given language before
  running its test server

If `<test-program>` is a `.js` file, then it is run under the same node
executable that `xlang_test.js` ran under.

The test program must accept a `--host host:port` option.  This option will be
added after any other arguments specified to `xlang_test.js`.

Example:
```
./node/scripts/xlang_test.js -n python -- node/test/streaming_bisect.js --first
```

## Language test server entry point

Each language must expose its test server under a `test_server` make target.

- the test server should be instructed to listen on `127.0.0.1` and choose a
  random port (aka listen on port `0`).
- the test server must print the string `listening on host:port` on a line by
  itself to STDOUT once the listening socket is ready to accept incoming
  connections.
