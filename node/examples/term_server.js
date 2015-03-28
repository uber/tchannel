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

var tchan = require('../index');
var endhand = require('../endpoint-handler');
var Logger = require('logtron');
var safeParse = require('safe-json-parse');
var split2 = require('split2');

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

chan.listen(4040, '0.0.0.0');

var Sessions = {};
var SessionId = 0;

var spawnPty = require('child_pty').spawn;
// var spawn = require('child_process').spawn;

function start(req, res) {
    withJsonArg2(req, res, function(arg2) {
        var sessionId = ++SessionId;
        var session = Sessions[sessionId] = TermSession(arg2.command);

        res.setOk(true);
        res.arg2.end(JSON.stringify({
            sessionId: sessionId
        }));
        session.handle(req, res);
    });
}

function control(req, res) {
    withJsonArg2(req, res, function(arg2) {
        var sessionId = arg2.sessionId;
        var session = Sessions[sessionId];
        if (!session) {
            res.sendNotOk(null, 'invalid sessionId');
            return;
        }

        res.setOk(true);
        res.arg2.end();
        session.control(req, res);
    });
}

function TermSession(cmd) {
    if (!(this instanceof TermSession)) {
        return new TermSession(cmd);
    }
    var self = this;
    self.cmd = cmd;
    self.proc = null;
}

TermSession.prototype.spawn = function spawn() {
    var self = this;
    if (!self.proc) {
        self.proc = spawnPty(self.cmd[0], self.cmd.slice(1), {
            // stdio: ['pipe', 'pipe', 'pipe']
        });
    }
    return self.proc;
};

TermSession.prototype.handle = function handle(req, res) {
    var self = this;
    self.spawn();
    req.arg3.pipe(self.proc.stdin); // , {end: true}
    self.proc.stdout.pipe(res.arg3); // , {end: true}
    // self.proc.stderr.pipe(res.arg3, {end: true});
};

TermSession.prototype.control = function control(req, res) {
    var self = this;
    var i = req.arg3.pipe(split2(JSON.parse));
    i.on('data', function(obj) {
        if (obj.op === 'resize') {
            chan.logger.info('resize to', obj);
            self.proc.stdout.resize({
                columns: obj.cols,
                rows: obj.rows
            });
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

function withJsonArg2(req, res, callback) {
    req.arg2.onValueReady(function(err, arg2) {
        if (err) {
            return res.sendError('ProtocolError');
        }
        safeParse(arg2, function(err, val) {
            if (err) res.sendError('BadRequest');
            else callback(val);
        });
    });
}
