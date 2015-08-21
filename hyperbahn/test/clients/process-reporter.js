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
var setTimeout = require('timers').setTimeout;
var processReporter = require('raynos-process-reporter');

test('processReporter reports libuv health', function t(assert) {
    var fakeStatsd = {
        records: [],
        timing: function timing(key, value) {
            this.records.push({
                key: key,
                value: value
            });
        }
    };

    var reporter = processReporter({
        handleInterval: 10,
        requestInterval: 10,
        statsd: fakeStatsd
    });
    reporter.bootstrap();

    setTimeout(onReported, 15);

    function onReported() {
        reporter.destroy();

        var records = fakeStatsd.records;
        var handles = records[0];
        var requests = records[1];

        assert.equal(records.length, 2);
        assert.equal(handles.key, 'process-reporter.handles');
        assert.equal(requests.key, 'process-reporter.requests');

        assert.equal(typeof handles.value, 'number');
        assert.equal(typeof requests.value, 'number');

        assert.end();
    }
});
