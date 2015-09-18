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

var TChannel = require('tchannel');
var test = require('tape');
var path = require('path');
var spawn = require('child_process').spawn;
var setTimeout = require('timers').setTimeout;
var process = require('process');
var console = require('console');

var serverFile = path.join(
    __dirname, '..', '..', 'server.js'
);

test('spin up autobahn', function t(assert) {
    var chan = TChannel();
    var autobahnClient = chan.makeSubChannel({
        serviceName: 'autobahn'
    });

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

        var host = '127.0.0.1:' + portNum;
        autobahnClient.waitForIdentified({
            host: host
        }, function onIdentified(err) {
            if (err) {
                onTCurlResult(err, null, null);
                return;
            }
            autobahnClient.request({
                host: host,
                hasNoParent: true,
                serviceName: 'autobahn',
                headers: {
                    as: 'json',
                    cn: 'test'
                }
            }).send('health_v1', '', '', onTCurlResult);
        });
    }

    function onTCurlResult(err, res, arg2, arg3) {
        if (process.env.NODE_DEBUG === 'autobahn') {
            console.log({
                arg2: arg2,
                arg3: arg3
            });
        }

        if (err) {
            return done(err);
        }

        assert.notEqual(
            String(arg3).indexOf('hello from autobahn\\n'),
            -1
        );
        assert.equal(String(arg2), 'null');

        done();
    }

    function done(err) {
        chan.close();
        proc.kill();
        if (err) {
            assert.ifError(err);
        }
        assert.end();
    }
});
