'use strict';

var test = require('tape');
var path = require('path');
var spawn = require('child_process').spawn;
var exec = require('child_process').exec;
var setTimeout = require('timers').setTimeout;
var process = require('process');
var console = require('console');

var serverFile = path.join(
    __dirname, '..', '..', 'server.js'
);
var tcurlFile = path.join(
    __dirname, '..', '..', 'bin', 'tcurl.js'
);

test('spin up autobahn', function t(assert) {
    /*eslint no-console: 0*/
    var proc = spawn('node', [
        serverFile,
        '--port', '0',
        '--controlPort', '0'
    ]);

    var autobahnOutput = '';
    var autobahnErrput = '';

    proc.stdout.on('data', function onData(buf) {
        autobahnOutput += String(buf);
    });
    proc.stderr.on('data', function onData(buf) {
        autobahnErrput += String(buf);
    });

    /* eslint no-process-env: 0 */
    if (process.env.NODE_DEBUG === 'autobahn') {
        proc.stdout.pipe(process.stdout);
        proc.stderr.pipe(process.stderr);
    }

    var yoloCounter = 0;

    setTimeout(verifyBooted, 500);

    function verifyBooted() {
        yoloCounter++;
        var lines = autobahnOutput.split('\n').filter(Boolean);

        if (lines.length === 0 && yoloCounter < 10) {
            return setTimeout(verifyBooted, 500);
        }

        assert.ok(lines.length > 0);

        var portLine = lines.filter(function find(x) {
            return x.indexOf('autobahn server started') >= 0;
        })[0];

        if (!portLine) {
            console.error('# server failed');
            console.error('# fail counter');
            console.error(yoloCounter);
            console.error('# server stdout');
            console.error(autobahnOutput);
            console.error('# server stderr');
            console.error(autobahnErrput);
        }

        assert.ok(portLine);
        var portJSON = JSON.parse(portLine);
        assert.ok(portJSON.serverAddress);

        var portNum = portJSON.serverAddress.port;

        exec(
            'node ' +
            tcurlFile + ' ' +
            '-p 127.0.0.1:' + portNum + ' ' +
            'autobahn' + ' ' +
            'health_v1',
            onTCurlResult
        );
    }

    function onTCurlResult(err, stdout, stderr) {
        if (process.env.NODE_DEBUG === 'autobahn') {
            console.log(stdout);
            console.error(stderr);
        }

        if (err) {
            return done(err);
        }

        assert.notEqual(
            String(stdout).indexOf('hello from autobahn\\n'),
            -1
        );
        assert.equal(stderr, '');

        done();
    }

    function done(err) {
        proc.kill();
        if (err) {
            assert.ifError(err);
        }
        assert.end();
    }
});
