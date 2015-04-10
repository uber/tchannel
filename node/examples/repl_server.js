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

var chalk = require('chalk');
var EventEmitter = require('events').EventEmitter;
var Logger = require('logtron');
var replr = require('replr');
var util = require('util');

var tchan = require('../channel');
var endhand = require('../endpoint-handler');
var TermServer = require('./term_server');

function main() {
    var chan = tchan({
        serviceName: 'repl-server',
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

    var statefulThing = {
        counter: 1
    };

    var repler = replr.create({
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

    var server = TermServer({
        logger: chan.logger,
        create: function create(sessionId, options, callback) {
            callback(null, ReplSession(repler, {
                logger: chan.logger
            }));
        }
    });
    server.register(chan.handler);

    chan.listen(4040, '127.0.0.1');
}

function ReplSession(repler, options) {
    if (!(this instanceof ReplSession)) {
        return new ReplSession(repler, options);
    }
    options = options || {};
    var self = this;
    self.repler = repler;
    self.logger = options.logger;
}

util.inherits(ReplSession, EventEmitter);

ReplSession.prototype.start = function start(stream) {
    var self = this;
    self.once('resize', function onResize(size) {
        self.repler.open(stream, {
            width: size.cols,
            height: size.rows
        });
    });
};

ReplSession.prototype.control = function control(stream) {
    var self = this;
    stream.on('data', function onControlData(obj) {
        if (obj.op === 'resize') {
            self.logger.info('resize to', obj);
            self.emit('resize', obj);
        } else {
            self.logger.error('invalid control op', obj);
        }
    });
};

if (require.main === module) {
    main();
}
