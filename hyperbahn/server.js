#!/usr/bin/env node
'use strict';

var startOfProcess = Date.now();

var StaticConfig = require('static-config');
var process = require('process');
var path = require('path');
var getRepoInfo = require('git-repo-info');
var parseArgs = require('minimist');
var setTimeout = require('timers').setTimeout;
var assert = require('assert');

var Application = require('./app.js');

var ABORT_TIMEOUT = 10 * 1000;

if (require.main === module) {
    main({
        argv: parseArgs(process.argv.slice(2))
    });
}

function main(opts) {
    /*eslint no-process-env: 0*/
    var start = Date.now();

    var gitRepo = path.join(__dirname, '.git');
    var gitSha = getRepoInfo(gitRepo).sha;

    assert(opts.argv.port !== undefined, '--port is required');

    var config = createConfig();
    var app = Application(config, opts);

    // attach before throwing exception
    process.on('uncaughtException', app.clients.onError);

    app.bootstrapAndListen(function onAppReady(err) {
        if (err) {
            app.clients.onError(err);

            setTimeout(abort, ABORT_TIMEOUT);

            return;
        }

        var logger = app.clients.logger;
        var serverAddr = app.tchannel.address();
        var replAddr = app.clients.repl.socketServer.address();

        var statsd = app.clients.statsd;
        var now = Date.now();

        statsd.timing('server.require-time', start - startOfProcess);
        statsd.timing('server.bootstrap-time', now - start);
        statsd.timing('server.startup-time', now - startOfProcess);

        logger.info('autobahn server started', {
            serverAddress: serverAddr,
            replAddr: replAddr,
            gitSha: gitSha,
            env: process.env,
            requireTime: start - startOfProcess,
            bootstrapTime: now - start,
            startupTime: now - startOfProcess
        });
    });
}

function abort() {
    process.abort();
}

function createConfig() {
    var configDir = path.join(__dirname, 'config');

    return StaticConfig({
        files: [
            path.join(configDir, 'production.json'),
            path.join(configDir, 'local.json')
        ]
    });
}
