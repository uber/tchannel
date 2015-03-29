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

var safeParse = require('safe-json-parse');

var tchan = require('../index');
var chan = tchan();

startCommand(chan, process.argv.slice(2));

function startCommand(chan, cmd) {
    var req = chan.request({
        host: '0.0.0.0:4040',
        timeout: 1000
    });
    req.on('response', onResponse);
    req.on('error', onError);

    req.arg1.end('start');
    req.arg2.end(JSON.stringify({
        command: cmd
    }));

    function onResponse(res) {
        withJsonResArg2(res, function(err, arg2) {
            if (err) {
                console.error(err);
                return;
            }

            process.stdin.setRawMode(true);
            process.stdin.pipe(req.arg3);
            startControlChannel(chan, arg2.sessionId, controlChannelReady);
            res.arg3.pipe(process.stdout);
            res.arg3.on('end', function() {
                process.stdin.setRawMode(false);
                chan.quit();
            });
        });
    }

    function onError(err) {
        console.error(err);
    }

    function controlChannelReady(err, ctl) {
        sendSize();
        process.stdout.on('resize', sendSize);

        function sendSize() {
            writeLDJson({
                op: 'resize',
                cols: process.stdout.columns,
                rows: process.stdout.rows
            });
        }

        function writeLDJson(o) {
            ctl.req.arg3.write(JSON.stringify(o) + '\n');
        }
    }
}

function startControlChannel(chan, sessionId, callback) {
    var req = chan.request({
        host: '0.0.0.0:4040',
        timeout: 1000
    });
    req.on('response', onResponse);
    req.on('error', onError);

    req.arg1.end('control');
    req.arg2.end(JSON.stringify({
        sessionId: sessionId
    }));

    function onResponse(res) {
        callback(null, {
            req: req,
            res: res
        });
    }

    function onError(err) {
        callback(err, null);
    }
}

function withJsonResArg2(res, callback) {
    res.arg2.onValueReady(function(err, arg2) {
        if (err) callback(err);
        else safeParse(arg2, callback);
    });
}
