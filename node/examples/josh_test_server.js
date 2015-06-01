// Copyright (c) 2015 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

var util = require('util');
var tchan = require('../channel');
var endhand = require('../endpoint-handler');
var Logger = require('logtron');

var chan = tchan({
    handler: endhand(),
    logger: Logger({
        meta: {
            team: 'wat',
            project: 'why'
        },
        backends: Logger.defaultBackends({
            console: true
        })
    })
});

echo.canStream = true;
chan.handler.register('echo', echo);

exec.canStream = true;
chan.handler.register('exec', exec);

repl.canStream = true;
chan.handler.register('repl', repl);

grepn.canStream = true;
chan.handler.register('grepn', grepn);

chan.listen(4040, '127.0.0.1');

var spawn = require('child_pty').spawn;
// var spawn = require('child_process').spawn;

function exec(req, buildRes) {
    req.arg2.onValueReady(function(err, cmd) {
        if (err) return buildRes().sendError('ProtocolError');

        var res = buildRes({streamed: true});
        cmd = String(cmd);
        // TODO shlex
        var parts = cmd.split(/ +/);
        console.log('exec %j', parts);
        var kid = spawn(parts.shift(), parts, {
            // stdio: ['pipe', 'pipe', 'pipe']
        });
        req.arg3.pipe(kid.stdin);
        kid.stdout.pipe(res.arg3);
        req.arg3.on('end', function() {
            res.arg3.end();
        });
        // kid.stderr.pipe(res.arg3);
    });
}

function grepn(req, buildRes) {
    var split2 = require('split2');
    var through2 = require('through2');
    req.arg2.onValueReady(function(err, needle) {
        if (err) return buildRes().sendError('ProtocolError');

        var res = buildRes({streamed: true});
        var pat = new RegExp(needle);
        console.log('GREPN', pat);

        var n = 0;
        req.arg3
            .pipe(split2())
            .pipe(through2(function(line, enc, done) {
                ++n;
                if (pat.test(line)) this.push(util.format('%d:%s\n', n, line));
                done();
            }))
            .pipe(res.arg3);
    });
}

function repl(req, buildRes) {
    console.log('repl', req.id);
    var res = buildRes({streamed: true});
    res.setOk(true);
    req.arg2.end();
    require('repl').start({
        prompt: '> ',
        input: req.arg3,
        output: res.arg3,
        terminal: true
    });
}

function echo(req, buildRes) {
    var res = buildRes({streamed: true});
    res.setOk(true);
    console.log('echo', req.id);
    req.arg2.onValueReady(function(err, value) {
        setImmediate(function end() {
            res.arg2.end(value);
        });
    });

    req.arg3.onValueReady(function(err, value) {
        setImmediate(function end() {
            res.arg3.end();
        });
    });
}
