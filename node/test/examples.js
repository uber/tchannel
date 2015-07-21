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

var test = require('tape');
var path = require('path');
var exec = require('child_process').exec;

test('running example1.js', function t(assert) {
    spawnExample('example1.js', onChild);

    function onChild(err, stdout, stderr) {
        assert.ifError(err);
        assert.equal(stderr, '');

        assert.ok(stdout.indexOf(
            'func1 responding with a small delay { arg2: \'arg 1\', arg3: \'arg 2\' }'
        ) >= 0);
        assert.ok(stdout.indexOf(
            'err res:  { ok: false, message: \'it failed\' }'
        ) >= 0);
        assert.ok(stdout.indexOf(
            'normal res: { arg2: \'result\', arg3: \'indeed it did\' }'
        ) >= 0);

        assert.end();
    }
});

test('running example2.js', function t(assert) {
    spawnExample('example2.js', onChild);

    function onChild(err, stdout, stderr) {
        assert.ifError(err);
        assert.equal(stderr, '');

        assert.ok(stdout.indexOf(
            'server got ping req from { remoteAddr: \'127.0.0.1:4041\' }'
        ) >= 0);
        assert.ok(stdout.indexOf(
            'ping res from server { arg2: \'pong\', arg3: \'\' }'
        ) >= 0);
        assert.ok(stdout.indexOf(
            'client got ping req from { remoteAddr: \'127.0.0.1:4040\' }'
        ) >= 0);
        assert.ok(stdout.indexOf(
            'ping res from client { arg2: \'pong\', arg3: \'\' }'
        ) >= 0);

        assert.end();
    }
});

test('running as_example1.js', function t(assert) {
    spawnExample('as_example1.js', onChild);

    function onChild(err, stdout, stderr) {
        assert.ifError(err);
        assert.equal(stderr, '');

        assert.ok(stdout.indexOf(
            'got resp { ok: true,'
        ) >= 0);
        assert.ok(stdout.indexOf(
            '  head: { head: \'object\' },'
        ) >= 0);
        assert.ok(stdout.indexOf(
            '  body: { body: \'object\' },'
        ) >= 0);
        assert.ok(stdout.indexOf(
            '  headers: { as: \'json\' } }'
        ) >= 0);

        assert.end();
    }
});

test('running send_test.js', function t(assert) {
    spawnExample('send_test.js', onChild);

    function onChild(err, stdout, stderr) {
        assert.ifError(err);
        assert.equal(stderr, '');

        [
            'server got ping req from 127.0.0.1:',
            'func 3 starting response timer',
            'func 1 responding immediately',
            'ping res from client: pong',
            '1 fast res: arg2=result arg3=indeed it did',
            'client got ping req from 127.0.0.1:',
            'ping res server: pong',
            '2 slow res: err=request timed out after',
            'func 3 starting response timer',
            'func 3 starting response timer',
            'func 3 responding now',
            '4 slow res: err=request timed out after',
            'func 3 responding now',
            'func 3 responding now'
        ].forEach(function each(str) {
            assert.ok(stdout.indexOf(
                str
            ) >= 0, 'expected to see ' + str);
        });

        assert.end();
    }
});


function spawnExample(exampleName, cb) {
    var file = path.join(__dirname, '..', 'examples', exampleName);

    exec('node ' + file, cb);
}
