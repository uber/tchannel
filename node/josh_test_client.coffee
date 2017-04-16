# Copyright (c) 2015 Uber Technologies, Inc.
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in
# all copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
# THE SOFTWARE.
argv = require('minimist')(process.argv.slice(2))
RNGStream = require('../test/lib/rng_stream')
tchan = require('../channel')
chan = tchan()
req = chan.request(
    host: '127.0.0.1:4040'
    timeout: 1000
    streamed: true)

onResponse = (res) ->
    res.arg3.pipe process.stdout
    res.arg3.on 'end', ->
        chan.quit()
        return
    return

req.on 'response', onResponse
req.arg1.end argv._[0]
req.arg2.end argv._[1]
if argv.rand
    RNGStream(limit: argv.rand).pipe req.arg3
else
    process.stdin.pipe req.arg3
