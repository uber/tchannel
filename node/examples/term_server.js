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

'use strict';

var duplexer = require('duplexer');
var safeParse = require('safe-json-parse');
var split2 = require('split2');
var nullLogger = require('../null-logger.js');

function TermServer(options) {
    if (!(this instanceof TermServer)) {
        return new TermServer(options);
    }
    var self = this;
    self.options = options || {};
    self.logger = options.logger || nullLogger;
    self.sessions = Object.create(null);
    self.sessionId = 0;
}

TermServer.prototype.register = function register(handler, startName, controlName) {
    var self = this;

    start.canStream = true;
    handler.register(startName || 'start', start);

    control.canStream = true;
    handler.register(controlName || 'control', control);

    function start(req, buildRes) {
        self.start(req, buildRes);
    }

    function control(req, buildRes) {
        self.control(req, buildRes);
    }
};

TermServer.prototype.start = function start(req, buildRes) {
    var self = this;
    var sessionId = ++self.sessionId;
    self.options.create(sessionId, {
        logger: self.logger,
        req: req,
        buildRes: buildRes,
    }, function created(err, session) {
        if (err) {
            buildRes().sendNotOk(null, err.message);
            return;
        }
        self.sessions[sessionId] = session;
        var res = buildRes({streamed: true});
        res.setOk(true);
        res.arg2.end(JSON.stringify({
            sessionId: sessionId
        }));
        var stream = duplexer(res.arg3, req.arg3);
        session.start(stream);
    });
};

TermServer.prototype.control = function control(req, buildRes) {
    var self = this;
    withJsonArg2(req, buildRes, function(arg2) {
        var sessionId = arg2.sessionId;
        var session = self.sessions[sessionId];
        if (!session) {
            buildRes().sendNotOk(null, 'invalid sessionId');
            return;
        }

        var res = buildRes({streamed: true});
        res.setOk(true);
        res.arg2.end();
        var stream = duplexer(
            res.arg3, // TODO: ld json encoder
            req.arg3.pipe(split2(JSON.parse)));
        stream.on('error', function(err) {
            self.logger.error('control arg3 error', err);
        });
        session.control(stream);
    });
};

module.exports = TermServer;

function main() {
    var tchan = require('../channel');
    var Logger = require('logtron');
    var endhand = require('../endpoint-handler');

    var chan = tchan({
        serviceName: 'term-server',
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

    var server = TermServer({
        logger: chan.logger,
        create: TermSession.create
    });
    server.register(chan.handler);

    chan.listen(4040, '127.0.0.1');
}

var spawnPty = require('child_pty').spawn;

function TermSession(cmd, options) {
    if (!(this instanceof TermSession)) {
        return new TermSession(cmd, options);
    }
    options = options || {};
    var self = this;
    self.cmd = cmd;
    self.proc = null;
    self.logger = options.logger;
}

TermSession.create = function create(sessionId, options, callback) {
    withJsonArg2(options.req, options.buildRes, function(arg2) {
        callback(null, TermSession(arg2.command, options));
    });
};

TermSession.prototype.start = function start(stream) {
    var self = this;
    self.proc = spawnPty(self.cmd[0], self.cmd.slice(1), {
        // stdio: ['pipe', 'pipe', 'pipe']
    });
    self.proc.stdout
        .pipe(stream)
        .pipe(self.proc.stdin);
};

TermSession.prototype.control = function control(stream) {
    var self = this;
    stream.on('data', function(obj) {
        if (obj.op === 'resize') {
            self.logger.info('resize to', obj);
            self.proc.stdout.resize({
                columns: obj.cols,
                rows: obj.rows
            });
        } else {
            self.logger.error('invalid control op', obj);
        }
    });
};

function withJsonArg2(req, buildRes, callback) {
    req.arg2.onValueReady(function(err, arg2) {
        if (err) return buildRes().sendError('UnexpectedError');
        safeParse(arg2, function(err, val) {
            if (err) return buildRes().sendError('BadRequest');
            else callback(val);
        });
    });
}

if (require.main === module) {
    main();
}
