#!/usr/bin/env node

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

var parseArgs = require('minimist');
var path = require('path');
var spawn = require('child_process').spawn;
var split2 = require('split2');

var tchannelDir = path.resolve(process.argv[1] + '/../../..');

var argv = parseArgs(process.argv.slice(2), {
    alias: {
        verbose: 'v',
        noinstall: 'n'
    },
    boolean: ['noinstall', 'verbose'],
    '--': true
});
var langs = argv._;
var test = argv['--'];

if (!langs.length) die('no language specified');
else if (langs.length > 1) die('only one language at a time supported');

if (!test.length) die('no test specified');
if (/\.js$/.test(test[0])) test.unshift(process.execPath);


var verboseRun = argv.verbose;

withLangServer(langs[0],
    function runTest(hostPort, done) {
        var cmd = test.concat(['--host', hostPort]);
        run(cmd, {
            stdio: 'inherit'
        }, done);
    },
    function done(err) {
        if (err) die(err);
    });

function withLangServer(lang, under, callback) {
    var called = false;
    var langDir = path.join(tchannelDir, lang);
    var cmd = ['make', '-C', langDir];
    if (!argv.noinstall) cmd.push('install');
    cmd.push('test_server');
    var serverProc = run(cmd, {
        stdio: ['pipe', 'pipe', process.stderr]
    }, onServerProcDone);

    process.once('exit', onProcExit);
    serverProc.stdout
        .pipe(split2())
        .on('data', onServerProcLine);

    function onServerProcDone(err) {
        if (!called) {
            called = true;
            process.removeListener('exit', onProcExit);
            callback(err);
        } else if (err) {
            die('server process error:', err);
        }
    }

    function onServerProcLine(line) {
        process.stdout.write(line + '\n');
        if (called) return;
        var match = /^listening on (.+)$/.exec(line);
        if (match) {
            called = true;
            var hostPort = match[1];
            under(hostPort, finish);
        }
    }

    function onProcExit() {
        serverProc.kill();
    }

    function finish(err, res) {
        process.removeListener('exit', onProcExit);
        serverProc.kill();
        callback(err, res);
    }
}

function run(cmd, options, done) {
    if (typeof options === 'function') {
        done = options;
        options = {};
    }
    if (verboseRun) console.log('+', cmd);
    var proc = spawn(cmd[0], cmd.slice(1), options);
    proc.on('error', done);
    proc.on('exit', onExit);
    return proc;

    function onExit(code, signal) {
        var err = null;
        if (code) err = new Error('exited non-zero ' + code);
        else if (signal && signal !== 'SIGTERM') err = new Error('exited due to signal ' + signal);
        done(err);
    }
}

function die() {
    console.error.apply(console, arguments);
    process.exit(1);
}
