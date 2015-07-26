'use strict';

var fs = require('fs');
var path = require('path');
var assert = require('assert');

var spec = fs.readFileSync(path.join(
    __dirname,
    '..',
    '..',
    'node_modules',
    'tchannel',
    'tcollector',
    'tcollector.thrift'
), 'utf8');

module.exports = FakeTCollector;

function FakeTCollector(options) {
    if (!(this instanceof FakeTCollector)) {
        return new FakeTCollector(options);
    }

    var self = this;

    assert(typeof options === 'object', 'options required');
    assert(typeof options.channel === 'object', 'options.channel required');

    self.channel = options.channel;

    self.thrift = new self.channel.TChannelAsThrift({
        source: spec
    });

    self.thrift.register(
        self.channel,
        'TCollector::submit',
        self,
        function onSubmit(opts, req, head, body, done) {
            self.onSubmit(opts, req, head, body, done);
        }
    );

    self.traces = [];
}

FakeTCollector.prototype.onSubmit =
function onSubmit(opts, req, head, body, done) {
    var self = this;

    self.traces.push(body.span);
    done(null, {ok: true, body: {ok: true}});
};
