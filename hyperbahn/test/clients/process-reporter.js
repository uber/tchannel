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
