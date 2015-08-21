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
var Replr = require('raynos-replr/lib/ReplrServer.js');
var process = require('process');

module.exports = createRepl;

function createRepl() {
    var opts = {
        name: 'Autobahn Service',
        prompt: chalk.grey('autobahn> '),
        useColors: true,
        exports: getExports
    };

    opts.port = 0;
    var replServer = new Replr(opts, false);
    var app = null;

    replServer.setApp = function setApp(_app) {
        app = _app;
    };

    return replServer;

    /* istanbul ignore next */
    function getExports() {
        return {
            app: function getApp() {
                return app;
            },
            keys: function getKeys() {
                return Object.keys(app);
            },
            throwIt: function throwIt() {
                process.nextTick(function nextTick() {
                    throw new Error('Test repl error');
                });
            }
        };
    }
}
