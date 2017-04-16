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
util = require('util')
tchan = require('../channel')
endhand = require('../endpoint-handler')
Logger = require('logtron')
chan = tchan(
    handler: endhand()
    logger: Logger(
        meta:
            team: 'wat'
            project: 'why'
        backends: Logger.defaultBackends(console: true)))
# var spawn = require('child_process').spawn;

exec = (req, buildRes) ->
    req.arg2.onValueReady (err, cmd) ->
        if err
            return buildRes().sendError('ProtocolError')
        res = buildRes(streamed: true)
        cmd = String(cmd)
        # TODO shlex
        parts = cmd.split(RegExp(' +'))
        console.log 'exec %j', parts
        kid = spawn(parts.shift(), parts, {})
        req.arg3.pipe kid.stdin
        kid.stdout.pipe res.arg3
        # kid.stderr.pipe(res.arg3);
        return
    return

grepn = (req, buildRes) ->
    split2 = require('split2')
    through2 = require('through2')
    req.arg2.onValueReady (err, needle) ->
        if err
            return buildRes().sendError('ProtocolError')
        res = buildRes(streamed: true)
        pat = new RegExp(needle)
        console.log 'GREPN', pat
        n = 0
        req.arg3.pipe(split2()).pipe(through2((line, enc, done) ->
            ++n
            if pat.test(line)
                @push util.format('%d:%s\n', n, line)
            done()
            return
        )).pipe res.arg3
        return
    return

repl = (req, buildRes) ->
    console.log 'repl', req.id
    res = buildRes(streamed: true)
    res.setOk true
    req.arg2.end()
    require('repl').start
        prompt: '> '
        input: req.arg3
        output: res.arg3
        terminal: true
    return

echo = (req, buildRes) ->
    res = buildRes(streamed: true)
    res.setOk true
    console.log 'echo', req.id
    req.arg2.pipe res.arg2
    req.arg3.pipe res.arg3
    return

echo.canStream = true
chan.handler.register 'echo', echo
exec.canStream = true
chan.handler.register 'exec', exec
repl.canStream = true
chan.handler.register 'repl', repl
grepn.canStream = true
chan.handler.register 'grepn', grepn
chan.listen 4040, '127.0.0.1'
spawn = require('child_pty').spawn
