'use strict';

var chalk = require('chalk');
var Replr = require('replr/lib/ReplrServer.js');
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
