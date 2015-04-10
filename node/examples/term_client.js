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

var async = require('async');
var duplexer = require('duplexer');
var EventEmitter = require('events').EventEmitter;
var inherits = require('util').inherits;
var safeJsonParse = require('safe-json-parse');
var extend = require('xtend');
var extendInto = require('xtend/mutable');

function TermClient(channel, options) {
    if (!(this instanceof TermClient)) {
        return new TermClient(channel, options);
    }
    var self = this;
    EventEmitter.call(self);
    self.channel = channel;
    self.options = options || {};
    self.session = null;
    self.stream = null;
    self.ctl = null;
}
inherits(TermClient, EventEmitter);

TermClient.prototype.start = function start() {
    var self = this;
    if (self.session) {
        self.emit('error', new Error('already started')); // TODO typed
        return;
    }

    async.waterfall([
        function startStream(next) {
            self.request('start', self.options.arg2, next);
        },

        function gotStream(req, res, next) {
            self.stream = duplexer(req.arg3, res.arg3);
            req.arg3.once('end', finish);
            res.arg3.once('end', finish);
            function finish() {
                req.arg3.removeListener('end', finish);
                res.arg3.removeListener('end', finish);
                self.emit('finished');
            }
            res.arg2.onValueReady(next);
        },

        safeJsonParse,
        function gotHead(head, next) {
            self.session = head.sessionId;
            self.request('control', JSON.stringify({
                sessionId: self.session
            }), next);
        },

        function gotControl(req, res, next) {
            self.ctl = duplexer(req.arg3, res.arg3);
            self.emit('started');
            next();
        }
    ], function done(err) {
        if (err) {
            self.emit('error', err); // TODO wrap
        }
    });
};

TermClient.prototype.request = function request(arg1, arg2, callback) {
    var self = this;
    var req = self.channel.request(extend(self.options.request, {
        streamed: true
    }));
    req.hookupStreamCallback(callback);
    req.arg1.end(arg1);
    if (arg2) req.arg2.end(arg2);
};

TermClient.prototype.linkSize = function linkSize(stream) {
    var self = this;
    sendSize();
    stream.on('resize', sendSize);
    function sendSize() {
        self.sendControl('resize', {
            cols: stream.columns,
            rows: stream.rows
        });
    }
};

TermClient.prototype.sendControl = function sendControl(op, extra) {
    var self = this;
    if (!self.ctl) {
        self.emit('error', new Error('no control channel to send op on'));
        return;
    }
    var body = {
        op: op
    };
    if (extra) {
        extendInto(body, extra);
    }
    self.ctl.write(JSON.stringify(body) + '\n');
};

module.exports = TermClient;

function main() {
    var cmd = process.argv.slice(2);
    var tchan = require('../channel');
    var chan = tchan();
    var client = TermClient(chan, {
        request: {
            host: '127.0.0.1:4040',
            timeout: 1000,
        },
        arg2: JSON.stringify({
            command: cmd
        })
    });
    client.on('error', onError);
    client.on('started', start);
    client.on('finished', finish);
    client.start();

    function onError(err) {
        console.error(err);
        finish();
    }

    function start() {
        client.linkSize(process.stdout);
        process.stdin.setRawMode(true);
        process.stdin
            .pipe(client.stream)
            .pipe(process.stdout);
    }

    function finish() {
        process.stdin.setRawMode(false);
        process.stdin.end();
        chan.close();
    }
}

if (require.main === module) {
    main();
}
