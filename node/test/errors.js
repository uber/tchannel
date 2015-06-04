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

var fs = require('fs');
var path = require('path');
var split2 = require('split2');
var test = require('tape');
var util = require('util');

var Errors = require('../errors.js');

var errorsPath = path.resolve(path.join(__dirname, '..', 'errors.js'));

test('errors module should be in sorted order', function t(assert) {
    var stream = fs.createReadStream(errorsPath, 'utf8');
    var exportedErrors = [];
    stream
        .pipe(split2())
        .on('data', extractExportedError)
        .on('end', streamDone);

    function extractExportedError(line) {
        var match = /^module\.exports\.([^ ]+) *= *([\w_\-]+)/.exec(line);
        if (match) {
            if (/Error$/.test(match[2])) {
                exportedErrors.push(match[1]);
            }
        }
    }

    function streamDone() {
        process.nextTick(checkExportedErrors);
    }

    function checkExportedErrors() {
        var expected = exportedErrors.slice().sort();
        var allOk = true;
        for (var i = 0; i < expected.length; i++) {
            if (exportedErrors[i] !== expected[i]) {
                allOk = false;
                assert.fail(util.format(
                    'errors module not in sorted order: %s is out of place (expected %s)',
                    exportedErrors[i], expected[i]));
            }
        }
        if (allOk) assert.pass('errors module is in sorted order');
        assert.end();
    }
});

test('error case statements should not be duplicates', function t(assert) {

    var stream = fs.createReadStream(errorsPath, 'utf8');
    var caseStatements = [];
    stream
        .pipe(split2())
        .on('data', extractCaseStatement)
        .on('end', streamDone);

    function extractCaseStatement(line) {
        var match = /case/.exec(line);
        if (match) {
            caseStatements.push(line);
        }
    }

    function streamDone() {
        process.nextTick(checkCases);
    }

    function checkCases() {
        var caseTypes = caseStatements.map(function extract(c) {
            c = c.trim();
            c = c.substr(6, c.length);
            c = c.substr(0, c.length - 2);
            return c;
        });

        var errorTypes = [];
        var keys = Object.keys(Errors);
        for (var i = 0; i < keys.length; i++) {
            var errorFn = Errors[keys[i]];
            if (!errorFn || !errorFn.type) {
                continue;
            }

            errorTypes.push(errorFn.type);
        }

        assert.equal(caseTypes.length, errorTypes.length);
        assert.deepEqual(
            caseTypes.sort(),
            errorTypes.sort()
        );

        assert.end();
    }
});

test('all errors are classified', function t(assert) {
    var keys = Object.keys(Errors);
    for (var i = 0; i < keys.length; i++) {
        var errorFn = Errors[keys[i]];
        if (!errorFn || !errorFn.type) {
            continue;
        }

        var errObj = errorFn(new Error('e'));

        var errorClass = Errors.classify(errObj);
        assert.ok(errorClass, errorFn.type + ' can be classified');
    }

    assert.end();
});
