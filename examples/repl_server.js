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

var chalk = require('chalk');
var duplexer = require('duplexer');
var endhand = require('../endpoint-handler');
var Logger = require('logtron');
var replr = require('replr');
var safeParse = require('safe-json-parse');
var split2 = require('split2');
var tchan = require('../index');

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

start.canStream = true;
chan.handler.register('start', start);

control.canStream = true;
chan.handler.register('control', control);

chan.listen(4040, '127.0.0.1');

var Sessions = {};
var SessionId = 0;

var statefulThing = {
    counter: 1
};

var replrServer = replr.create({
    name: 'tchannel repl server example',
    mode: 'noserver',
    prompt: chalk.gray('tchanrepl> '),
    useColors: true,
    useGlobal: true,
    ignoreUndefined: true,
    exports: function replrExports() {
        return {
            increment: function increment() {
                return statefulThing.counter++;
            },
            getStatefulThing: function getStatefulThing() {
                return statefulThing;
            }
        };
    }
});

function start(req, buildRes) {
    var sessionId = ++SessionId;
    var session = Sessions[sessionId] = ReplSession();

    var res = buildRes({streamed: true});
    res.setOk(true);
    res.arg2.end(JSON.stringify({
        sessionId: sessionId
    }));
    session.handle(req, res);
}

function control(req, buildRes) {
    withJsonArg2(req, buildRes, function(arg2) {
        var sessionId = arg2.sessionId;
        var session = Sessions[sessionId];
        if (!session) {
            buildRes().sendNotOk(null, 'invalid sessionId');
            return;
        }

        var res = buildRes({streamed: true});
        res.setOk(true);
        res.arg2.end();
        session.control(req, res);
    });
}

function ReplSession() {
    if (!(this instanceof ReplSession)) {
        return new ReplSession();
    }
}

ReplSession.prototype.handle = function handle(req, res) {
    setImmediate(startReplSession);

    function startReplSession() {
        replrServer.open(duplexer(res.arg3, req.arg3));
    }
};

ReplSession.prototype.control = function control(req, res) {
    var self = this;
    var i = req.arg3.pipe(split2(JSON.parse));
    i.on('data', function(obj) {
        if (obj.op === 'resize') {
            chan.logger.info('resize to', obj);
        } else {
            chan.logger.error('invalid control op', obj);
        }
    });
    i.on('end', function() {
        res.arg3.end();
    });
    i.on('error', function(err) {
        chan.logger.error('control arg3 error', err);
    });
};

function withJsonArg2(req, buildRes, callback) {
    req.arg2.onValueReady(function(err, arg2) {
        if (err) return buildRes().sendError('ProtocolError');
        safeParse(arg2, function(err, val) {
            if (err) return buildRes().sendError('BadRequest');
            else callback(val);
        });
    });
}
